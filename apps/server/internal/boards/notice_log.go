package boards

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1 "github.com/calaba/calaba/server/gen/calaba/v1"
	"github.com/calaba/calaba/server/internal/db"
	"github.com/calaba/calaba/server/internal/db/sqlc"
	"github.com/calaba/calaba/server/internal/httpx"
	"github.com/calaba/calaba/server/internal/messages"
	"github.com/calaba/calaba/server/internal/perm"
)

// NoticeLogRetention is how long the inbox keeps a task notice (ADR-0141).
const NoticeLogRetention = 90 * 24 * time.Hour

// logNotice writes a notice the user is about to get into their notice history (ADR-0141) and
// returns its id ("" when it could not be written: the live notice still goes out).
func (s *Service) logNotice(ctx context.Context, taskID uuid.UUID, n notice, tn *v1.TaskNotice) string {
	id, err := uuid.NewV7()
	if err != nil {
		return ""
	}
	opt := func(u uuid.UUID) *uuid.UUID {
		if u == uuid.Nil {
			return nil
		}
		return &u
	}
	// The same commit admission as the task write that produced the notice: a request-born
	// notice is admitted for its actor; a background notice (reminders) carries none.
	err = db.GuardExec(ctx, s.db, func(guarded *sqlc.Queries) error {
		return guarded.InsertTaskNotice(ctx, sqlc.InsertTaskNoticeParams{
			ID: id, UserID: n.user, TaskID: taskID, Kind: int16(tn.GetKind()), //nolint:gosec // enum, < 100
			ActorID: opt(n.actor), MessageID: opt(n.message), Text: tn.GetText(), RuleID: opt(n.rule),
			ReRequested: n.reRequested, DueOn: n.dueOn, DaysLeft: n.daysLeft,
		})
	})
	if err != nil {
		slog.WarnContext(ctx, "boards: notice log", "task", taskID, "err", err)
		return ""
	}
	return id.String()
}

// listNotices: GET /api/me/task-notices?before=&limit= — the caller's task notices (ADR-0141),
// newest first, of tasks the caller still sees, with the task's current key and title.
func (s *Service) listNotices(w http.ResponseWriter, r *http.Request) error {
	p, err := messages.ParsePage(r)
	if err != nil {
		return err
	}
	if p.After != nil {
		return httpx.BadRequest("only before is supported")
	}
	ctx := r.Context()
	me := uid(r)
	rows, err := s.db.Q.ListTaskNoticeLog(ctx, sqlc.ListTaskNoticeLogParams{UserID: me, Before: p.Before, Lim: p.Limit + 1})
	if err != nil {
		return err
	}
	out := &v1.ListTaskNoticesResponse{Entries: []*v1.TaskNoticeEntry{}, HasMore: len(rows) > int(p.Limit)}
	if out.HasMore {
		rows = rows[:p.Limit]
	}
	if len(rows) == 0 {
		httpx.Write(w, http.StatusOK, out)
		return nil
	}
	ids := make([]uuid.UUID, 0, len(rows))
	seen := map[uuid.UUID]bool{}
	for _, l := range rows {
		if !seen[l.TaskID] {
			seen[l.TaskID] = true
			ids = append(ids, l.TaskID)
		}
	}
	ts, err := queryTasks(ctx, s.db.Pool, "WHERE t.id = ANY($1)", ids)
	if err != nil {
		return err
	}
	// The task as the caller may see it now: the workspace is open to them (suspension,
	// identity policy) and the task is visible (sees: board access, task scope, live).
	visible := map[uuid.UUID]taskRow{}
	wsOK := map[uuid.UUID]bool{}
	for _, t := range ts {
		ok, known := wsOK[t.WorkspaceID]
		if !known {
			err := perm.CheckAccess(ctx, t.WorkspaceID, me)
			if err != nil && httpx.AsError(err).Status >= 500 {
				return err
			}
			ok = err == nil
			wsOK[t.WorkspaceID] = ok
		}
		if !ok {
			continue
		}
		users, err := sees(ctx, s.db.Q, t, []uuid.UUID{me})
		if err != nil {
			return err
		}
		if len(users) == 1 {
			visible[t.ID] = t
		}
	}
	for _, l := range rows {
		t, ok := visible[l.TaskID]
		if !ok {
			continue
		}
		out.Entries = append(out.Entries, &v1.TaskNoticeEntry{
			Id: l.ID.String(), WorkspaceId: t.WorkspaceID.String(), BoardId: t.BoardID.String(), TaskId: t.ID.String(),
			TaskKey: TaskKey(t.BoardKey, t.Number), TaskTitle: t.Title, CreatedAt: timestamppb.New(l.CreatedAt),
			Notice: noticeOf(l),
		})
	}
	httpx.Write(w, http.StatusOK, out)
	return nil
}

// noticeOf is the wire notice of a history row.
func noticeOf(l sqlc.TaskNoticeLog) *v1.TaskNotice {
	return &v1.TaskNotice{
		Id: l.ID.String(), Kind: v1.TaskNoticeKind(l.Kind), ActorId: idp(l.ActorID), MessageId: idp(l.MessageID),
		Text: l.Text, RuleId: idp(l.RuleID), ReRequested: l.ReRequested, DueOn: l.DueOn, DaysLeft: l.DaysLeft,
	}
}
