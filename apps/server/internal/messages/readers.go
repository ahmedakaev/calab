package messages

import (
	"bytes"
	"context"
	"net/http"

	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1 "github.com/calaba/calaba/server/gen/calaba/v1"
	"github.com/calaba/calaba/server/internal/db"
	"github.com/calaba/calaba/server/internal/db/sqlc"
	"github.com/calaba/calaba/server/internal/httpx"
	"github.com/calaba/calaba/server/internal/perm"
	"github.com/calaba/calaba/server/internal/rooms"
)

// recordReadSpan keeps the run of the seen marker of user in room (ADR-0140 §3): it moved from
// prev to upto — the run that ended at prev grows if it is fresh, otherwise a new run starts.
func recordReadSpan(ctx context.Context, q *sqlc.Queries, room, user uuid.UUID, prev *uuid.UUID, upto uuid.UUID) error {
	if prev != nil {
		n, err := q.ExtendReadSpan(ctx, sqlc.ExtendReadSpanParams{RoomID: room, UserID: user, PrevID: *prev, UptoID: upto})
		if err != nil || n > 0 {
			return err
		}
	}
	return q.InsertReadSpan(ctx, sqlc.InsertReadSpanParams{RoomID: room, UserID: user, AfterID: prev, UptoID: upto})
}

// readersOf returns who saw each of ms (all of room) on screen, by message id (ADR-0140): only
// the messages of author written since read receipts started; a guest author sees only the
// people of its rooms. Other messages are absent from the map.
func (h *Handlers) readersOf(ctx context.Context, acc perm.RoomAccess, room, author uuid.UUID, ms []sqlc.Message) (map[uuid.UUID][]*v1.MessageReader, error) {
	from, err := db.FeatureEpoch(ctx, h.db.Q, db.EpochReadReceipts)
	if err != nil {
		return nil, err
	}
	var ids []uuid.UUID
	for _, m := range ms {
		if m.AuthorID == author && m.RoomID == room && bytes.Compare(m.ID[:], from[:]) >= 0 {
			ids = append(ids, m.ID)
		}
	}
	out := map[uuid.UUID][]*v1.MessageReader{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := h.db.Q.ListMessageReaders(ctx, sqlc.ListMessageReadersParams{RoomID: room, MessageIds: ids})
	if err != nil {
		return nil, err
	}
	var allowed map[uuid.UUID]bool
	if acc.Role == perm.RoleGuest {
		if allowed, err = rooms.GuestVisibleUsers(ctx, h.db.Q, nil, acc.WorkspaceID, author); err != nil {
			return nil, err
		}
	}
	for _, id := range ids {
		out[id] = []*v1.MessageReader{}
	}
	for _, row := range rows {
		if allowed != nil && !allowed[row.UserID] {
			continue
		}
		out[row.MessageID] = append(out[row.MessageID], &v1.MessageReader{UserId: row.UserID.String(), ReadAt: timestamppb.New(row.ReadAt)})
	}
	return out, nil
}

// withReadBy fills Message.read_by of the caller's own messages among out (REST answers to the
// author only, ADR-0140 §4).
func (h *Handlers) withReadBy(r *http.Request, acc perm.RoomAccess, room uuid.UUID, ms []sqlc.Message, out []*v1.Message) error {
	by, err := h.readersOf(r.Context(), acc, room, uid(r), ms)
	if err != nil {
		return err
	}
	for i, m := range ms {
		if rs, ok := by[m.ID]; ok && i < len(out) {
			out[i].ReadBy = rs
		}
	}
	return nil
}

// peerRead is the furthest seen marker of the other people of room (ADR-0140 §2): the value of
// READ_RECEIPT for rooms READY does not list.
func (h *Handlers) peerRead(ctx context.Context, room, me uuid.UUID) (string, error) {
	prs, err := h.db.Q.ListPeerReads(ctx, sqlc.ListPeerReadsParams{UserID: me, RoomIds: []uuid.UUID{room}})
	if err != nil || len(prs) == 0 {
		return "", err
	}
	return prs[0].LastReadMessageID.String(), nil
}

// readers answers GET /api/rooms/{id}/messages/{messageId}/readers: who saw the message — the
// author only (ADR-0140 §4).
func (h *Handlers) readers(w http.ResponseWriter, r *http.Request) error {
	roomID, err := httpx.PathUUID(r, "id", "room")
	if err != nil {
		return err
	}
	acc, err := rooms.ReadAccess(r, roomID)
	if err != nil {
		return err
	}
	id, err := httpx.PathUUID(r, "messageId", "message")
	if err != nil {
		return err
	}
	since, err := h.clearedBefore(r, acc, roomID)
	if err != nil {
		return err
	}
	if since != nil && bytes.Compare(id[:], since[:]) <= 0 {
		return httpx.NotFound("message")
	}
	m, err := h.db.Q.GetMessage(r.Context(), id)
	if db.IsNotFound(err) || (err == nil && (m.RoomID != roomID || m.DeletedAt != nil)) {
		return httpx.NotFound("message")
	}
	if err != nil {
		return err
	}
	if m.AuthorID != uid(r) {
		return httpx.Forbidden("only the author sees who read the message")
	}
	by, err := h.readersOf(r.Context(), acc, roomID, m.AuthorID, []sqlc.Message{m})
	if err != nil {
		return err
	}
	httpx.Write(w, http.StatusOK, &v1.ListMessageReadersResponse{Readers: by[m.ID]})
	return nil
}
