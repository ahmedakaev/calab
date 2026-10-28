// Package office opens Disk files (xlsx, docx) in ONLYOFFICE Docs (ADR-0143, spike, off by
// default: OFFICE_ENABLED). The editing and the recalculation run in the user's browser; this
// package only
//
//   - signs the editor configuration (GET /api/office/config): the mode follows the Disk bits
//     (DISK_WRITE edits, DISK_VIEW views) and the co-editing key is shared by everyone who opens
//     the item until its session ends;
//   - hands the file to the Document Server by a short-lived signed URL
//     (GET /api/office/file/{token}), pinned to the file version the session stands on;
//   - stores what the Document Server sends back (POST /api/office/callback/{token}, statuses 2
//     and 6) as a new version of the same Disk item: same id, path and name, new file row, new
//     sha256 and size.
//
// Requests from the Document Server carry its JWT (HS256, the shared OFFICE_JWT_SECRET); the
// file and callback URLs carry our own token (a key derived from the API's JWT_SECRET), so
// neither secret alone mints the other side's requests.
package office

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/calaba/calaba/server/internal/httpx"
	"github.com/calaba/calaba/server/internal/perm"
)

// Config is the env configuration (internal/config: OFFICE_*).
type Config struct {
	// DocsURL is the Document Server origin the browser loads the editor from.
	DocsURL string
	// DocsInternalURL is how the API reaches the Document Server (saved files); the download
	// URL of a callback must be on DocsURL or DocsInternalURL. Empty = DocsURL.
	DocsInternalURL string
	// APIURL is how the Document Server reaches the API: the file and callback URLs it gets.
	APIURL string
	// Secret is the Document Server's JWT secret (JWT_SECRET of its container).
	Secret []byte
	// URLKey signs our file and callback URLs (derived from the API's JWT_SECRET).
	URLKey []byte
	// ThemeDark and ThemeLight are the editor's uiTheme for the app's themes (a custom theme
	// JSON on the Document Server, e.g. theme-calab-dark, or a built-in default-dark).
	ThemeDark, ThemeLight string
	// FileURLTTL bounds the file URL (the Document Server fetches it at once). 0 = 5 min.
	FileURLTTL time.Duration
	// MaxSize bounds a saved file. 0 = 100 MiB.
	MaxSize int64
}

// Item is a Disk file as this package needs it.
type Item struct {
	ID, WorkspaceID, FileID uuid.UUID
	Name                    string
	Size                    int64
	Sha256                  string
	UpdatedAt               time.Time
	// Bits are the caller's bits on the item (ItemFor only).
	Bits perm.Bits
	// Trashed items open read-only; ReadOnly is a workspace that cannot take writes (plan).
	Trashed, ReadOnly bool
}

// Store is the Disk side (a DB adapter over internal/disk + internal/files in the full
// implementation; fakes in the tests).
type Store interface {
	// ItemFor resolves a Disk file as the member uid sees it: ErrNotFound without DISK_VIEW.
	ItemFor(ctx context.Context, uid, itemID uuid.UUID) (Item, error)
	// Item resolves a Disk file without a caller (requests of the Document Server).
	Item(ctx context.Context, itemID uuid.UUID) (Item, error)
	// OpenFile streams one stored file (a version pinned by id).
	OpenFile(ctx context.Context, fileID uuid.UUID) (io.ReadCloser, int64, error)
	// SaveVersion stores body as the item's new file if its current file is still expect
	// (ErrConflict otherwise): the item keeps its id, parent and name; the previous file stays
	// as a version in «История»; actor is the editor who sent the changes (nil: unknown).
	SaveVersion(ctx context.Context, itemID, expect uuid.UUID, actor *uuid.UUID, body io.Reader, size int64) (Item, error)
}

// Session is the live co-editing session of an item.
type Session struct {
	// Key is the Document Server's document.key: everyone who opens the item joins it.
	Key string
	// FileID is the file the session's edits stand on: the file at its start, then the one
	// each forcesave (status 6) stored.
	FileID uuid.UUID
}

// Sessions keeps the live sessions (Valkey in the full implementation: a hash per item with a
// TTL that status 1 refreshes; fakes in the tests). Every method is atomic per item.
type Sessions interface {
	// Join returns the item's live session or starts s (set if absent).
	Join(ctx context.Context, item uuid.UUID, s Session) (Session, error)
	// Get returns the item's live session.
	Get(ctx context.Context, item uuid.UUID) (Session, bool, error)
	// Advance moves the session with key onto fileID (after a forcesave); false if it is gone.
	Advance(ctx context.Context, item uuid.UUID, key string, fileID uuid.UUID) (bool, error)
	// End removes the session with key (compare and delete).
	End(ctx context.Context, item uuid.UUID, key string) error
}

// Presence learns who has the item open (status 1): «редактирует Имя» in the listing.
type Presence interface {
	Editing(ctx context.Context, item uuid.UUID, users []uuid.UUID)
}

var (
	// ErrNotFound means no such Disk file, or the caller cannot see it.
	ErrNotFound = errors.New("office: not found")
	// ErrConflict means the item's file changed under the session (SaveVersion).
	ErrConflict = errors.New("office: the file changed")
)

// Service serves the office routes.
type Service struct {
	cfg      Config
	store    Store
	sessions Sessions
	// Presence is optional.
	Presence Presence
	// HTTP fetches saved files from the Document Server.
	HTTP *http.Client
	// Now is the clock (tests move it).
	Now func() time.Time
}

// New creates the service.
func New(cfg Config, store Store, sessions Sessions) *Service {
	if cfg.FileURLTTL <= 0 {
		cfg.FileURLTTL = 5 * time.Minute
	}
	if cfg.MaxSize <= 0 {
		cfg.MaxSize = 100 << 20
	}
	if cfg.DocsInternalURL == "" {
		cfg.DocsInternalURL = cfg.DocsURL
	}
	if cfg.ThemeDark == "" {
		cfg.ThemeDark = "default-dark"
	}
	if cfg.ThemeLight == "" {
		cfg.ThemeLight = "default-light"
	}
	cfg.DocsURL = strings.TrimRight(cfg.DocsURL, "/")
	cfg.APIURL = strings.TrimRight(cfg.APIURL, "/")
	return &Service{cfg: cfg, store: store, sessions: sessions, HTTP: &http.Client{Timeout: 2 * time.Minute}, Now: time.Now}
}

// Routes registers the routes; wrap applies auth + the permission resolver. The file and
// callback routes are anonymous: our URL token and the Document Server's JWT authenticate them.
func (s *Service) Routes(mux httpx.Router, wrap func(http.Handler) http.Handler) {
	mux.Handle("GET /api/office/config", wrap(httpx.HandlerFunc(s.config)))
	mux.Handle("GET /api/office/file/{token}", httpx.HandlerFunc(s.file))
	mux.Handle("POST /api/office/callback/{token}", http.HandlerFunc(s.callback))
}

// sameOrigin reports whether raw is an http(s) URL on the origin of base.
func sameOrigin(raw, base string) bool {
	u, err := url.Parse(raw)
	b, err2 := url.Parse(base)
	if err != nil || err2 != nil || b.Host == "" {
		return false
	}
	return (u.Scheme == "http" || u.Scheme == "https") && u.Scheme == b.Scheme && strings.EqualFold(u.Host, b.Host) && u.User == nil
}
