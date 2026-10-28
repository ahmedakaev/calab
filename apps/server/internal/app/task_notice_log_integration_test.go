//go:build integration

package app_test

import (
	"testing"

	v1 "github.com/calaba/calaba/server/gen/calaba/v1"
)

// TestTaskNoticeLog (ADR-0140): a notice the server sends is kept in the recipient's history
// with the live notice's id; the list is the recipient's own, newest first, paged, with the
// task's current key and title, and hides tasks the recipient no longer sees.
func TestTaskNoticeLog(t *testing.T) {
	o, bob, ws, _ := setupTeam(t)
	wid := ws.GetId()
	list := func(u *user, query string) *v1.ListTaskNoticesResponse {
		t.Helper()
		var out v1.ListTaskNoticesResponse
		u.must(200, "GET", "/api/me/task-notices"+query, nil, &out)
		return &out
	}
	if n := len(list(bob, "").GetEntries()); n != 0 { // bob is a fresh user; the owner is shared
		t.Fatalf("a fresh user has %d notices", n)
	}
	b := createBoard(t, o, wid, &v1.CreateBoardRequest{Name: "Входящие", Key: "INB"}, 201)
	gb := dialGW(t)
	gb.identify(bob.token)
	task := createTask(t, o, b.GetId(), &v1.CreateTaskRequest{Title: "Отчёт", Assignees: []*v1.TaskAssigneeInput{{UserId: bob.id}}}, 201)
	live := gb.wait("assigned", noticeOf(task.GetId(), v1.TaskNoticeKind_TASK_NOTICE_KIND_ASSIGNED)).GetTaskUpdate().GetNotice()
	if live.GetId() == "" {
		t.Fatal("the live notice has no history id")
	}
	// A comment mentioning bob: a second notice, newer.
	send(t, o, task.GetRoomId(), "глянь @"+bob.id, "")
	gb.wait("mentioned", noticeOf(task.GetId(), v1.TaskNoticeKind_TASK_NOTICE_KIND_MENTIONED))

	got := list(bob, "")
	es := got.GetEntries()
	if len(es) != 2 || got.GetHasMore() {
		t.Fatalf("bob notices: %v", es)
	}
	if es[0].GetNotice().GetKind() != v1.TaskNoticeKind_TASK_NOTICE_KIND_MENTIONED || es[1].GetId() != live.GetId() {
		t.Fatalf("order / ids: %v", es)
	}
	e := es[1]
	if e.GetTaskId() != task.GetId() || e.GetTaskKey() != "INB-1" || e.GetTaskTitle() != "Отчёт" || e.GetWorkspaceId() != wid ||
		e.GetBoardId() != b.GetId() || e.GetNotice().GetActorId() != o.id || e.GetCreatedAt() == nil {
		t.Fatalf("entry: %v", e)
	}
	if es[0].GetNotice().GetMessageId() == "" {
		t.Fatal("a comment mention carries the comment id")
	}
	// The owner made the changes: nothing of this task for them.
	for _, e := range list(o, "?limit=100").GetEntries() {
		if e.GetTaskId() == task.GetId() {
			t.Fatalf("the actor got their own notice: %v", e)
		}
	}
	// Pages.
	page := list(bob, "?limit=1")
	if len(page.GetEntries()) != 1 || !page.GetHasMore() {
		t.Fatal("first page")
	}
	page = list(bob, "?limit=1&before="+page.GetEntries()[0].GetId())
	if len(page.GetEntries()) != 1 || page.GetHasMore() || page.GetEntries()[0].GetId() != live.GetId() {
		t.Fatal("second page")
	}
	bob.must(400, "GET", "/api/me/task-notices?after="+live.GetId(), nil, nil)
	// The title is the current one.
	o.must(200, "PATCH", "/api/tasks/"+task.GetId(), &v1.UpdateTaskRequest{Title: new("Отчёт за квартал")}, nil)
	if e := list(bob, "").GetEntries(); len(e) == 0 || e[len(e)-1].GetTaskTitle() != "Отчёт за квартал" {
		t.Fatalf("renamed: %v", e)
	}
	// Removed from the workspace: the history is hidden.
	o.must(204, "DELETE", "/api/workspaces/"+wid+"/members/"+bob.id, nil, nil)
	if n := len(list(bob, "").GetEntries()); n != 0 {
		t.Fatalf("a former member sees %d notices", n)
	}
}
