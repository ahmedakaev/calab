package office

import (
	"encoding/json"
	"errors"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/google/uuid"

	v1 "github.com/calaba/calaba/server/gen/calaba/v1"
	"github.com/calaba/calaba/server/internal/auth"
	"github.com/calaba/calaba/server/internal/httpx"
	"github.com/calaba/calaba/server/internal/perm"
)

// HostPath is where the Calab host page (infra/office/calab-editor.{html,js}) is served on the
// Document Server's origin: mounted read-only into its web-apps tree, which the Document Server's
// own nginx already serves (no extra ingress rule).
const HostPath = "/web-apps/apps/calab/calab-editor.html"

// docKind is the Document Server's fileType and documentType of a name ("" = not opened here).
func docKind(name string) (fileType, documentType string) {
	switch strings.ToLower(strings.TrimPrefix(path.Ext(name), ".")) {
	case "xlsx":
		return "xlsx", "cell"
	case "docx":
		return "docx", "word"
	}
	return "", ""
}

// Mode maps the caller's Disk bits on the item to the editor mode: DISK_WRITE (which «Правка»
// gives, with DISK_VIEW) edits; DISK_VIEW alone views; nothing is not found. A trashed item, a
// workspace that takes no writes and the phone (Community Edition has no mobile web editing)
// view only.
func Mode(it Item, phone bool) v1.OfficeMode {
	switch {
	case !it.Bits.Has(perm.DiskView):
		return v1.OfficeMode_OFFICE_MODE_UNSPECIFIED
	case it.Bits.Has(perm.DiskWrite) && !it.Trashed && !it.ReadOnly && !phone:
		return v1.OfficeMode_OFFICE_MODE_EDIT
	default:
		return v1.OfficeMode_OFFICE_MODE_VIEW
	}
}

var errUnsupported = httpx.Coded(http.StatusUnsupportedMediaType, v1.ErrorCode_ERROR_CODE_VALIDATION, "this file type does not open in the editor")

// config: GET /api/office/config?item=&theme=dark|light&phone=1&lang=ru.
func (s *Service) config(w http.ResponseWriter, r *http.Request) error {
	id := auth.MustFromContext(r.Context())
	itemID, err := uuid.Parse(r.URL.Query().Get("item"))
	if err != nil {
		return httpx.NotFound("item")
	}
	it, err := s.store.ItemFor(r.Context(), id.UserID, itemID)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound("item")
	}
	if err != nil {
		return err
	}
	q := r.URL.Query()
	resp, err := s.Build(r, it, id.UserID, displayName(r), q.Get("theme") == "light", q.Get("phone") == "1", q.Get("lang"))
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.Write(w, http.StatusOK, resp)
	return nil
}

// displayName is the editor's name of the caller (shown to co-editors). The full
// implementation reads the member's display name; the spike sends the user id.
func displayName(r *http.Request) string { return auth.MustFromContext(r.Context()).UserID.String() }

// Build makes the signed editor configuration of it for uid; it joins the item's session (or
// starts one), so everyone who opens the item until the session ends shares its key.
func (s *Service) Build(r *http.Request, it Item, uid uuid.UUID, name string, light, phone bool, lang string) (*v1.OfficeConfigResponse, error) {
	fileType, docType := docKind(it.Name)
	if fileType == "" {
		return nil, errUnsupported
	}
	mode := Mode(it, phone)
	if mode == v1.OfficeMode_OFFICE_MODE_UNSPECIFIED {
		return nil, httpx.NotFound("item")
	}
	ctx := r.Context()
	sess, err := s.sessions.Join(ctx, it.ID, Session{Key: sessionKey(s.cfg.URLKey, it.ID, it.FileID), FileID: it.FileID})
	if err != nil {
		return nil, err
	}
	if sess.FileID != it.FileID {
		// A session left behind (the Document Server lost it, or the file changed outside the
		// editor): its key would open stale content. Start over on the current file.
		if err := s.sessions.End(ctx, it.ID, sess.Key); err != nil {
			return nil, err
		}
		if sess, err = s.sessions.Join(ctx, it.ID, Session{Key: sessionKey(s.cfg.URLKey, it.ID, it.FileID), FileID: it.FileID}); err != nil {
			return nil, err
		}
	}
	now := s.Now()
	fileTok, err := signURL(s.cfg.URLKey, opFile, it.ID, sess.FileID, now.Add(s.cfg.FileURLTTL))
	if err != nil {
		return nil, err
	}
	cbTok, err := signURL(s.cfg.URLKey, opCallback, it.ID, uuid.Nil, time.Time{})
	if err != nil {
		return nil, err
	}
	edit := mode == v1.OfficeMode_OFFICE_MODE_EDIT
	theme := s.cfg.ThemeDark
	if light {
		theme = s.cfg.ThemeLight
	}
	if lang == "" {
		lang = "ru"
	}
	editorMode, editorType := "view", "desktop"
	if edit {
		editorMode = "edit"
	}
	if phone {
		editorType = "mobile"
	}
	cfg := map[string]any{
		"type":         editorType,
		"documentType": docType,
		"document": map[string]any{
			"fileType": fileType,
			"key":      sess.Key,
			"title":    it.Name,
			"url":      s.cfg.APIURL + "/api/office/file/" + fileTok,
			"permissions": map[string]any{
				"edit": edit, "comment": edit, "review": edit, "fillForms": edit, "modifyFilter": edit,
				"download": true, "print": true, "copy": true, "chat": false, "protect": false,
			},
		},
		"editorConfig": map[string]any{
			"mode":        editorMode,
			"lang":        lang,
			"callbackUrl": s.cfg.APIURL + "/api/office/callback/" + cbTok,
			"coEditing":   map[string]any{"mode": "fast", "change": false},
			"user":        map[string]any{"id": uid.String(), "name": name},
			"customization": map[string]any{
				// Free in Community Edition (not license-gated in web-apps); see ADR-0143 §Вид.
				"uiTheme":             theme,
				"compactHeader":       true,
				"compactToolbar":      false,
				"toolbarHideFileName": true, // the Calab frame shows the name
				"hideRightMenu":       true,
				"autosave":            true,
				"forcesave":           true, // Ctrl+S / «Сохранить» → status 6 → a version now
				"help":                false,
				"feedback":            false,
				"plugins":             false,
				"close":               map[string]any{"visible": false},
				"zoom":                100,
				"unit":                "cm",
			},
		},
	}
	tok, err := signConfig(s.cfg.Secret, cfg)
	if err != nil {
		return nil, err
	}
	cfg["token"] = tok
	raw, err := json.Marshal(cfg)
	if err != nil {
		return nil, err
	}
	return &v1.OfficeConfigResponse{DocsUrl: s.cfg.DocsURL, HostUrl: s.cfg.DocsURL + HostPath, ConfigJson: string(raw), Mode: mode, Key: sess.Key}, nil
}
