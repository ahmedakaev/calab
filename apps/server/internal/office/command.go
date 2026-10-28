package office

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"

	v1 "github.com/calaba/calaba/server/gen/calaba/v1"
)

// Access during an open session (ADR-0143 «Угрозы»: a downgrade). A save is refused when its
// author lost «Правка» (save); besides, whoever is connected is rechecked when somebody joins
// (status 1) and by the sweep every SweepInterval: a member without DISK_VIEW, or an editor
// without DISK_WRITE, is dropped from the session by the Document Server's command service.

// SweepInterval is how often the live sessions are rechecked.
const SweepInterval = time.Minute

// RunSweep rechecks the live sessions every interval until ctx is done (every API instance runs
// it; drops are idempotent).
func (s *Service) RunSweep(ctx context.Context, interval time.Duration) {
	if !s.cfg.Enabled {
		return
	}
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			items, err := s.sessions.Live(ctx)
			if err != nil {
				slog.WarnContext(ctx, "office: sweep", "err", err)
				continue
			}
			for _, id := range items {
				s.recheck(ctx, id)
			}
		}
	}
}

// recheck drops the connected users of item's session who lost access.
func (s *Service) recheck(ctx context.Context, item uuid.UUID) {
	sess, ok, err := s.sessions.Get(ctx, item)
	if err != nil || !ok {
		return
	}
	editors := map[uuid.UUID]bool{}
	for _, u := range sess.Editors {
		editors[u] = true
	}
	var drop, revoke []uuid.UUID
	for _, u := range sess.Online {
		it, err := s.store.ItemFor(ctx, u, item)
		switch {
		case errors.Is(err, ErrNotFound):
			drop = append(drop, u)
		case err != nil:
			slog.WarnContext(ctx, "office: recheck", "item", item, "err", err)
			return
		case editors[u]:
			f, _ := FormatOf(it.Name)
			if Mode(it, f, false) != v1.OfficeMode_OFFICE_MODE_EDIT {
				drop, revoke = append(drop, u), append(revoke, u)
			}
		}
	}
	if len(drop) == 0 {
		return
	}
	slog.InfoContext(ctx, "office: drop", "item", item, "key", sess.Key, "users", drop)
	if len(revoke) > 0 {
		if err := s.sessions.Revoke(ctx, item, sess.Key, revoke); err != nil {
			slog.WarnContext(ctx, "office: revoke", "item", item, "err", err)
		}
	}
	ids := make([]string, len(drop))
	for i, u := range drop {
		ids[i] = u.String()
	}
	if err := s.command(ctx, map[string]any{"c": "drop", "key": sess.Key, "users": ids}); err != nil {
		slog.WarnContext(ctx, "office: drop", "item", item, "err", err)
	}
}

// command calls the Document Server's command service (POST {internal}/command, the JWT in
// the body: its claims are the command).
func (s *Service) command(ctx context.Context, cmd map[string]any) error {
	var res struct {
		Error int `json:"error"`
	}
	if err := s.postDS(ctx, "/command", cmd, &res); err != nil {
		return err
	}
	// 1: the key is unknown (the session ended meanwhile) — nothing to drop.
	if res.Error != 0 && res.Error != 1 {
		return fmt.Errorf("office: command service error %d", res.Error)
	}
	return nil
}

// postDS posts a signed JSON request to the Document Server and decodes its JSON answer.
func (s *Service) postDS(ctx context.Context, path string, body map[string]any, out any) error {
	tok, err := signConfig(s.cfg.Secret, body)
	if err != nil {
		return err
	}
	signed := make(map[string]any, len(body)+1)
	for k, v := range body {
		signed[k] = v
	}
	signed["token"] = tok
	raw, err := json.Marshal(signed)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.cfg.DocsInternalURL+path, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	res, err := s.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("office: document server %s answered %d", path, res.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(res.Body, 1<<16)).Decode(out)
}
