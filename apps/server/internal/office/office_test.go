package office

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"google.golang.org/protobuf/encoding/protojson"

	v1 "github.com/calaba/calaba/server/gen/calaba/v1"
	"github.com/calaba/calaba/server/internal/auth"
	"github.com/calaba/calaba/server/internal/perm"
)

// ---- fakes ----

type fakeStore struct {
	mu       sync.Mutex
	items    map[uuid.UUID]Item
	files    map[uuid.UUID][]byte
	bits     map[uuid.UUID]perm.Bits // per user
	versions map[uuid.UUID][]uuid.UUID
	actors   []uuid.UUID
}

func newFakeStore() *fakeStore {
	return &fakeStore{items: map[uuid.UUID]Item{}, files: map[uuid.UUID][]byte{}, bits: map[uuid.UUID]perm.Bits{}, versions: map[uuid.UUID][]uuid.UUID{}}
}

func (f *fakeStore) add(name string, body []byte) Item {
	f.mu.Lock()
	defer f.mu.Unlock()
	it := Item{ID: uuid.New(), WorkspaceID: uuid.New(), FileID: uuid.New(), Name: name, Size: int64(len(body)), Sha256: sum(body)}
	f.items[it.ID], f.files[it.FileID] = it, body
	return it
}

func sum(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }

func (f *fakeStore) ItemFor(_ context.Context, uid, id uuid.UUID) (Item, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	it, ok := f.items[id]
	if !ok || !f.bits[uid].Has(perm.DiskView) {
		return Item{}, ErrNotFound
	}
	it.Bits = f.bits[uid]
	return it, nil
}

func (f *fakeStore) Item(_ context.Context, id uuid.UUID) (Item, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	it, ok := f.items[id]
	if !ok {
		return Item{}, ErrNotFound
	}
	return it, nil
}

func (f *fakeStore) OpenFile(_ context.Context, id uuid.UUID) (io.ReadCloser, int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	b := f.files[id]
	return io.NopCloser(bytes.NewReader(b)), int64(len(b)), nil
}

func (f *fakeStore) SaveVersion(_ context.Context, id, expect uuid.UUID, actor *uuid.UUID, body io.Reader, size int64) (Item, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	it := f.items[id]
	if it.FileID != expect {
		return Item{}, ErrConflict
	}
	b, _ := io.ReadAll(body)
	if int64(len(b)) != size {
		panic("size")
	}
	f.versions[id] = append(f.versions[id], it.FileID)
	it.FileID, it.Size, it.Sha256 = uuid.New(), size, sum(b)
	f.files[it.FileID] = b
	f.items[id] = it
	if actor != nil {
		f.actors = append(f.actors, *actor)
	}
	return it, nil
}

type fakeSessions struct {
	mu sync.Mutex
	m  map[uuid.UUID]Session
}

func (f *fakeSessions) Join(_ context.Context, item uuid.UUID, s Session) (Session, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if cur, ok := f.m[item]; ok {
		return cur, nil
	}
	f.m[item] = s
	return s, nil
}

func (f *fakeSessions) Get(_ context.Context, item uuid.UUID) (Session, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	s, ok := f.m[item]
	return s, ok, nil
}

func (f *fakeSessions) Advance(_ context.Context, item uuid.UUID, key string, fileID uuid.UUID) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	s, ok := f.m[item]
	if !ok || s.Key != key {
		return false, nil
	}
	s.FileID = fileID
	f.m[item] = s
	return true, nil
}

func (f *fakeSessions) End(_ context.Context, item uuid.UUID, key string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if s, ok := f.m[item]; ok && s.Key == key {
		delete(f.m, item)
	}
	return nil
}

type fakePresence struct{ got []uuid.UUID }

func (p *fakePresence) Editing(_ context.Context, _ uuid.UUID, users []uuid.UUID) { p.got = users }

// ---- harness ----

var (
	dsSecret  = []byte("document-server-secret-0123456789abcdef")
	apiSecret = []byte("api-jwt-secret-0123456789abcdef-xyz")
)

type harness struct {
	t        *testing.T
	svc      *Service
	store    *fakeStore
	sessions *fakeSessions
	mux      *http.ServeMux
	ds       *httptest.Server // the Document Server's saved-file host
	saved    map[string][]byte
	now      time.Time
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	h := &harness{t: t, store: newFakeStore(), sessions: &fakeSessions{m: map[uuid.UUID]Session{}}, mux: http.NewServeMux(), saved: map[string][]byte{}, now: time.Date(2026, 10, 28, 12, 0, 0, 0, time.UTC)}
	h.ds = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, ok := h.saved[r.URL.Path]
		if !ok {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write(b)
	}))
	t.Cleanup(h.ds.Close)
	h.svc = New(Config{DocsURL: "https://docs.calab.test", DocsInternalURL: h.ds.URL, APIURL: "http://api.calab.test", Secret: dsSecret, URLKey: DeriveURLKey(apiSecret)}, h.store, h.sessions)
	h.svc.Now = func() time.Time { return h.now }
	h.svc.HTTP = h.ds.Client()
	h.svc.Routes(h.mux, func(next http.Handler) http.Handler { return next })
	return h
}

// open is GET /api/office/config as uid.
func (h *harness) open(uid, item uuid.UUID, query string) (*httptest.ResponseRecorder, *v1.OfficeConfigResponse, map[string]any) {
	h.t.Helper()
	r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/office/config?item="+item.String()+query, nil)
	r = r.WithContext(auth.WithIdentity(r.Context(), auth.Identity{UserID: uid}))
	w := httptest.NewRecorder()
	h.mux.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		return w, nil, nil
	}
	var resp v1.OfficeConfigResponse
	if err := protojson.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		h.t.Fatal(err)
	}
	var cfg map[string]any
	if err := json.Unmarshal([]byte(resp.ConfigJson), &cfg); err != nil {
		h.t.Fatal(err)
	}
	return w, &resp, cfg
}

func dig(m map[string]any, path ...string) any {
	var v any = m
	for _, p := range path {
		v = v.(map[string]any)[p]
	}
	return v
}

// dsToken signs as the Document Server.
func dsToken(t *testing.T, secret []byte, claims jwt.MapClaims) string {
	t.Helper()
	s, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

// callback posts a callback body to the configuration's callbackUrl, signed the 10.0 header
// way (Authorization: Bearer, claims.payload = body, operation = callback).
func (h *harness) callback(cfg map[string]any, body map[string]any) int {
	h.t.Helper()
	tok := dsToken(h.t, dsSecret, jwt.MapClaims{"payload": body, "operation": "callback"})
	return h.post(cfg, body, "Bearer "+tok)
}

func (h *harness) post(cfg map[string]any, body map[string]any, authz string) int {
	h.t.Helper()
	cb, _ := url.Parse(dig(cfg, "editorConfig", "callbackUrl").(string))
	raw, _ := json.Marshal(body)
	r := httptest.NewRequestWithContext(context.Background(), http.MethodPost, cb.Path, bytes.NewReader(raw))
	if authz != "" {
		r.Header.Set("Authorization", authz)
	}
	w := httptest.NewRecorder()
	h.mux.ServeHTTP(w, r)
	var out struct {
		Error int `json:"error"`
	}
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &out) != nil {
		h.t.Fatalf("callback answered %d %q", w.Code, w.Body.String())
	}
	return out.Error
}

// edited puts a saved file on the fake Document Server and returns its URL.
func (h *harness) edited(name string, b []byte) string {
	h.saved["/cache/"+name] = b
	return h.ds.URL + "/cache/" + name
}

func editor(h *harness, bits perm.Bits) uuid.UUID {
	u := uuid.New()
	h.store.bits[u] = bits
	return u
}

const (
	view = perm.DiskView
	edit = perm.DiskView | perm.DiskWrite
)

// ---- tests ----

func TestConfigSignedAndShaped(t *testing.T) {
	h := newHarness(t)
	it := h.store.add("График отпусков 2026.xlsx", []byte("v1"))
	u := editor(h, edit)
	w, resp, cfg := h.open(u, it.ID, "&theme=light")
	if w.Code != http.StatusOK {
		t.Fatalf("config %d %s", w.Code, w.Body)
	}
	if resp.DocsUrl != "https://docs.calab.test" || resp.HostUrl != "https://docs.calab.test/web-apps/apps/calab/calab-editor.html" || resp.Mode != v1.OfficeMode_OFFICE_MODE_EDIT {
		t.Fatalf("resp %+v", resp)
	}
	// The token verifies with the Document Server's secret and its claims are the config.
	claims, err := parseDS(dsSecret, cfg["token"].(string))
	if err != nil {
		t.Fatal(err)
	}
	if dig(claims, "document", "key") != resp.Key || dig(claims, "editorConfig", "mode") != "edit" || claims["documentType"] != "cell" {
		t.Fatalf("claims %v", claims)
	}
	if _, err := parseDS([]byte("another-secret-0123456789abcdef-xx"), cfg["token"].(string)); err == nil {
		t.Fatal("the token verified with a wrong secret")
	}
	if dig(cfg, "editorConfig", "customization", "uiTheme") != "default-light" {
		t.Fatal("theme")
	}
	if dig(cfg, "document", "permissions", "edit") != true || dig(cfg, "document", "fileType") != "xlsx" {
		t.Fatal("permissions")
	}
	if !strings.HasPrefix(dig(cfg, "document", "url").(string), "http://api.calab.test/api/office/file/") {
		t.Fatal("file url")
	}
	if k := resp.Key; len(k) > 128 || strings.Trim(k, "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-._=") != "" {
		t.Fatalf("key %q is not a valid document.key", k)
	}
}

func TestModeFromDiskBits(t *testing.T) {
	for _, c := range []struct {
		name            string
		bits            perm.Bits
		trashed, ro, ph bool
		want            v1.OfficeMode
	}{
		{"Правка", edit, false, false, false, v1.OfficeMode_OFFICE_MODE_EDIT},
		{"manage", edit | perm.DiskManage, false, false, false, v1.OfficeMode_OFFICE_MODE_EDIT},
		{"Просмотр", view, false, false, false, v1.OfficeMode_OFFICE_MODE_VIEW},
		{"write without view", perm.DiskWrite, false, false, false, v1.OfficeMode_OFFICE_MODE_UNSPECIFIED},
		{"nothing", 0, false, false, false, v1.OfficeMode_OFFICE_MODE_UNSPECIFIED},
		{"trashed", edit, true, false, false, v1.OfficeMode_OFFICE_MODE_VIEW},
		{"read-only workspace", edit, false, true, false, v1.OfficeMode_OFFICE_MODE_VIEW},
		{"phone", edit, false, false, true, v1.OfficeMode_OFFICE_MODE_VIEW},
	} {
		t.Run(c.name, func(t *testing.T) {
			if got := Mode(Item{Bits: c.bits, Trashed: c.trashed, ReadOnly: c.ro}, c.ph); got != c.want {
				t.Fatalf("got %v want %v", got, c.want)
			}
		})
	}

	h := newHarness(t)
	it := h.store.add("Договор.docx", []byte("v1"))
	_, resp, cfg := h.open(editor(h, view), it.ID, "")
	if resp.Mode != v1.OfficeMode_OFFICE_MODE_VIEW || dig(cfg, "editorConfig", "mode") != "view" || dig(cfg, "document", "permissions", "edit") != false {
		t.Fatal("Просмотр must open read-only")
	}
	if w, _, _ := h.open(editor(h, 0), it.ID, ""); w.Code != http.StatusNotFound {
		t.Fatalf("no access: %d, want 404", w.Code)
	}
	if w, _, _ := h.open(editor(h, edit), uuid.New(), ""); w.Code != http.StatusNotFound {
		t.Fatalf("unknown item: %d", w.Code)
	}
	pdf := h.store.add("scan.pdf", []byte("%PDF"))
	if w, _, _ := h.open(editor(h, edit), pdf.ID, ""); w.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("pdf: %d, want 415", w.Code)
	}
	_, _, mob := h.open(editor(h, edit), it.ID, "&phone=1")
	if mob["type"] != "mobile" || dig(mob, "editorConfig", "mode") != "view" {
		t.Fatal("the phone views")
	}
}

func TestFileURL(t *testing.T) {
	h := newHarness(t)
	it := h.store.add("a.xlsx", []byte("bytes-v1"))
	_, _, cfg := h.open(editor(h, edit), it.ID, "")
	u, _ := url.Parse(dig(cfg, "document", "url").(string))
	get := func(authz string) *httptest.ResponseRecorder {
		r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, u.Path, nil)
		if authz != "" {
			r.Header.Set("Authorization", authz)
		}
		w := httptest.NewRecorder()
		h.mux.ServeHTTP(w, r)
		return w
	}
	good := "Bearer " + dsToken(t, dsSecret, jwt.MapClaims{"payload": map[string]any{"url": u.String()}, "operation": "download"})
	if w := get(good); w.Code != http.StatusOK || w.Body.String() != "bytes-v1" {
		t.Fatalf("download %d %q", w.Code, w.Body)
	}
	if w := get(""); w.Code != http.StatusUnauthorized {
		t.Fatalf("without the Document Server token: %d", w.Code)
	}
	if w := get("Bearer " + dsToken(t, []byte("wrong-secret-0123456789abcdef0123"), jwt.MapClaims{})); w.Code != http.StatusUnauthorized {
		t.Fatalf("wrong secret: %d", w.Code)
	}
	if w := get("Bearer " + dsToken(t, dsSecret, jwt.MapClaims{"operation": "callback"})); w.Code != http.StatusUnauthorized {
		t.Fatalf("a callback token: %d", w.Code)
	}
	h.now = h.now.Add(6 * time.Minute)
	if w := get(good); w.Code != http.StatusNotFound {
		t.Fatalf("expired url: %d", w.Code)
	}
	// A callback URL token does not open the file route.
	cb, _ := url.Parse(dig(cfg, "editorConfig", "callbackUrl").(string))
	r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/office/file/"+strings.TrimPrefix(cb.Path, "/api/office/callback/"), nil)
	r.Header.Set("Authorization", good)
	w := httptest.NewRecorder()
	h.mux.ServeHTTP(w, r)
	if w.Code != http.StatusNotFound {
		t.Fatalf("callback token on the file route: %d", w.Code)
	}
}

// The whole flow: two editors share the key; a forcesave (6) stores a version and keeps the key;
// the final save (2) stores another one and ends the session; the next open gets a new key; the
// item keeps its id and name while its file, sha256 and size follow the saves.
func TestCoEditingAndVersions(t *testing.T) {
	h := newHarness(t)
	it := h.store.add("ФОТ.xlsx", []byte("v1"))
	a, b := editor(h, edit), editor(h, edit)
	pr := &fakePresence{}
	h.svc.Presence = pr
	_, ra, cfgA := h.open(a, it.ID, "")
	_, rb, _ := h.open(b, it.ID, "")
	if ra.Key != rb.Key {
		t.Fatal("co-editors must share the key")
	}
	key := ra.Key

	if e := h.callback(cfgA, map[string]any{"key": key, "status": 1, "users": []string{a.String(), b.String()}}); e != 0 || len(pr.got) != 2 {
		t.Fatalf("status 1: %d %v", e, pr.got)
	}

	// Forcesave (Ctrl+S): a version now, the session goes on with the same key.
	if e := h.callback(cfgA, map[string]any{"key": key, "status": 6, "forcesavetype": 1, "filetype": "xlsx", "url": h.edited("f1", []byte("v2-forcesave")), "users": []string{b.String()}}); e != 0 {
		t.Fatalf("status 6 refused")
	}
	cur, _ := h.store.Item(context.Background(), it.ID)
	if cur.ID != it.ID || cur.Name != it.Name || cur.FileID == it.FileID || cur.Sha256 != sum([]byte("v2-forcesave")) || cur.Size != int64(len("v2-forcesave")) {
		t.Fatalf("after forcesave: %+v", cur)
	}
	if s, ok, _ := h.sessions.Get(context.Background(), it.ID); !ok || s.Key != key || s.FileID != cur.FileID {
		t.Fatalf("session after forcesave: %+v %v", s, ok)
	}
	// A third member joins the running session: same key, file URL pinned to the forcesaved file.
	_, rc, _ := h.open(editor(h, view), it.ID, "")
	if rc.Key != key {
		t.Fatal("a member opening during the session must join it")
	}

	// Everyone closed: status 2 → the final version, the session ends.
	if e := h.callback(cfgA, map[string]any{"key": key, "status": 2, "filetype": "xlsx", "url": h.edited("f2", []byte("v3-final")), "users": []string{a.String()}}); e != 0 {
		t.Fatalf("status 2 refused")
	}
	cur, _ = h.store.Item(context.Background(), it.ID)
	if cur.Sha256 != sum([]byte("v3-final")) || len(h.store.versions[it.ID]) != 2 {
		t.Fatalf("after save: %+v, versions %d", cur, len(h.store.versions[it.ID]))
	}
	if h.store.actors[0] != b || h.store.actors[1] != a {
		t.Fatalf("actors %v", h.store.actors)
	}
	if _, ok, _ := h.sessions.Get(context.Background(), it.ID); ok {
		t.Fatal("the session must end after status 2")
	}
	_, rn, _ := h.open(a, it.ID, "")
	if rn.Key == key {
		t.Fatal("after a save the key must change")
	}

	// A stale key: a late save of the ended session is refused, nothing is stored.
	if e := h.callback(cfgA, map[string]any{"key": key, "status": 2, "filetype": "xlsx", "url": h.edited("late", []byte("late")), "users": []string{a.String()}}); e != 1 {
		t.Fatal("a stale key must be refused")
	}
	if cur2, _ := h.store.Item(context.Background(), it.ID); cur2.FileID != cur.FileID {
		t.Fatal("a stale save stored a version")
	}
	// A stale status 1 / 4 is ignored, not an error.
	if e := h.callback(cfgA, map[string]any{"key": key, "status": 4}); e != 0 {
		t.Fatal("stale status 4")
	}
}

func TestCallbackStatusesWithoutSave(t *testing.T) {
	for _, st := range []int{3, 7} {
		h := newHarness(t)
		it := h.store.add("a.docx", []byte("v1"))
		_, r, cfg := h.open(editor(h, edit), it.ID, "")
		if e := h.callback(cfg, map[string]any{"key": r.Key, "status": st}); e != 0 {
			t.Fatalf("status %d: %d", st, e)
		}
		if len(h.store.versions[it.ID]) != 0 {
			t.Fatalf("status %d stored a version", st)
		}
		if _, ok, _ := h.sessions.Get(context.Background(), it.ID); !ok {
			t.Fatalf("status %d ended the session", st)
		}
	}
	h := newHarness(t)
	it := h.store.add("a.docx", []byte("v1"))
	_, r, cfg := h.open(editor(h, edit), it.ID, "")
	if e := h.callback(cfg, map[string]any{"key": r.Key, "status": 4}); e != 0 {
		t.Fatal("status 4")
	}
	if _, ok, _ := h.sessions.Get(context.Background(), it.ID); ok || len(h.store.versions[it.ID]) != 0 {
		t.Fatal("status 4 must end the session without a version")
	}
	_, r2, _ := h.open(editor(h, edit), it.ID, "")
	if r2.Key != r.Key {
		t.Fatal("no changes, no new key")
	}
}

func TestCallbackRefusals(t *testing.T) {
	setup := func(t *testing.T) (*harness, Item, uuid.UUID, string, map[string]any) {
		h := newHarness(t)
		it := h.store.add("a.xlsx", []byte("v1"))
		u := editor(h, edit)
		_, r, cfg := h.open(u, it.ID, "")
		return h, it, u, r.Key, cfg
	}
	save := func(_ *harness, key string, u uuid.UUID, src string) map[string]any {
		return map[string]any{"key": key, "status": 2, "filetype": "xlsx", "url": src, "users": []string{u.String()}}
	}
	t.Run("no token", func(t *testing.T) {
		h, _, u, key, cfg := setup(t)
		if h.post(cfg, save(h, key, u, h.edited("x", []byte("x"))), "") != 1 {
			t.Fatal("accepted")
		}
	})
	t.Run("wrong secret", func(t *testing.T) {
		h, _, u, key, cfg := setup(t)
		body := save(h, key, u, h.edited("x", []byte("x")))
		tok := dsToken(t, []byte("wrong-secret-0123456789abcdef0123"), jwt.MapClaims{"payload": body})
		if h.post(cfg, body, "Bearer "+tok) != 1 {
			t.Fatal("accepted")
		}
	})
	t.Run("operation download", func(t *testing.T) {
		h, _, u, key, cfg := setup(t)
		body := save(h, key, u, h.edited("x", []byte("x")))
		if h.post(cfg, body, "Bearer "+dsToken(t, dsSecret, jwt.MapClaims{"payload": body, "operation": "download"})) != 1 {
			t.Fatal("accepted")
		}
	})
	t.Run("token in body (JWT_IN_BODY)", func(t *testing.T) {
		h, it, u, key, cfg := setup(t)
		body := save(h, key, u, h.edited("x", []byte("body-mode")))
		signed := jwt.MapClaims{}
		for k, v := range body {
			signed[k] = v
		}
		body["token"] = dsToken(t, dsSecret, signed)
		if h.post(cfg, body, "") != 0 {
			t.Fatal("refused")
		}
		if cur, _ := h.store.Item(context.Background(), it.ID); cur.Sha256 != sum([]byte("body-mode")) {
			t.Fatal("not saved")
		}
	})
	t.Run("the signed body wins over the raw one", func(t *testing.T) {
		h, it, u, key, cfg := setup(t)
		signed := save(h, key, u, h.edited("good", []byte("signed")))
		raw := save(h, key, u, h.edited("evil", []byte("raw")))
		if h.post(cfg, raw, "Bearer "+dsToken(t, dsSecret, jwt.MapClaims{"payload": signed})) != 0 {
			t.Fatal("refused")
		}
		if cur, _ := h.store.Item(context.Background(), it.ID); cur.Sha256 != sum([]byte("signed")) {
			t.Fatal("stored the unsigned body")
		}
	})
	t.Run("source not on the Document Server", func(t *testing.T) {
		h, _, u, key, cfg := setup(t)
		if h.callback(cfg, save(h, key, u, "http://169.254.169.254/latest/meta-data")) != 1 {
			t.Fatal("accepted an SSRF url")
		}
	})
	t.Run("editor lost Правка", func(t *testing.T) {
		h, _, u, key, cfg := setup(t)
		h.store.bits[u] = view
		if h.callback(cfg, save(h, key, u, h.edited("x", []byte("x")))) != 1 {
			t.Fatal("accepted")
		}
	})
	t.Run("no editor", func(t *testing.T) {
		h, _, _, key, cfg := setup(t)
		body := save(h, key, uuid.Nil, h.edited("x", []byte("x")))
		body["users"] = []string{}
		if h.callback(cfg, body) != 1 {
			t.Fatal("accepted")
		}
	})
	t.Run("file type changed", func(t *testing.T) {
		h, _, u, key, cfg := setup(t)
		body := save(h, key, u, h.edited("x", []byte("x")))
		body["filetype"] = "ods"
		if h.callback(cfg, body) != 1 {
			t.Fatal("accepted")
		}
	})
	t.Run("file changed under the session", func(t *testing.T) {
		h, it, u, key, cfg := setup(t)
		other := uuid.New()
		h.store.mu.Lock()
		x := h.store.items[it.ID]
		x.FileID = other
		h.store.items[it.ID] = x
		h.store.mu.Unlock()
		if h.callback(cfg, save(h, key, u, h.edited("x", []byte("x")))) != 1 {
			t.Fatal("accepted over a newer file")
		}
		if cur, _ := h.store.Item(context.Background(), it.ID); cur.FileID != other {
			t.Fatal("overwritten")
		}
	})
	t.Run("too large", func(t *testing.T) {
		h, _, u, key, cfg := setup(t)
		h.svc.cfg.MaxSize = 4
		if h.callback(cfg, save(h, key, u, h.edited("x", []byte("12345")))) != 1 {
			t.Fatal("accepted")
		}
	})
	t.Run("url token of another kind", func(t *testing.T) {
		h, it, u, key, _ := setup(t)
		fileTok, _ := signURL(h.svc.cfg.URLKey, opFile, it.ID, it.FileID, h.now.Add(time.Minute))
		cfg := map[string]any{"editorConfig": map[string]any{"callbackUrl": "http://api.calab.test/api/office/callback/" + fileTok}}
		if h.callback(cfg, save(h, key, u, h.edited("x", []byte("x")))) != 1 {
			t.Fatal("accepted")
		}
	})
}

// A session left behind on an older file (the Document Server lost it) is replaced on open.
func TestStaleSessionRestarts(t *testing.T) {
	h := newHarness(t)
	it := h.store.add("a.xlsx", []byte("v1"))
	h.sessions.m[it.ID] = Session{Key: "calab-old", FileID: uuid.New()}
	_, r, _ := h.open(editor(h, edit), it.ID, "")
	if r.Key == "calab-old" {
		t.Fatal("joined a stale session")
	}
	if s, _, _ := h.sessions.Get(context.Background(), it.ID); s.FileID != it.FileID {
		t.Fatal("the new session must stand on the current file")
	}
}

func TestSessionKeyDeterministic(t *testing.T) {
	k := DeriveURLKey(apiSecret)
	i, f := uuid.New(), uuid.New()
	k1, k2 := sessionKey(k, i, f), sessionKey(k, i, f)
	if k1 != k2 || k1 == sessionKey(k, i, uuid.New()) {
		t.Fatal("key")
	}
	if sessionKey(k, i, f) == sessionKey(DeriveURLKey([]byte("other")), i, f) {
		t.Fatal("keys must differ per installation")
	}
}
