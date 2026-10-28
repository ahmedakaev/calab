package boards

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/calaba/calaba/server/internal/perm"
)

func TestParseTaskSearch(t *testing.T) {
	for raw, want := range map[string]struct {
		sort string
		desc bool
		err  bool
	}{
		"q=abc":                         {sort: "relevance"},
		"":                              {sort: "updated", desc: true},
		"q=!!!":                         {sort: "updated", desc: true}, // no words: no relevance
		"q=abc&sort=-key":               {sort: "key", desc: true},
		"sort=status":                   {sort: "status"},
		"sort=color":                    {err: true},
		"archived=yes":                  {err: true},
		"state=closed":                  {err: true},
		"cursor=2001":                   {err: true},
		"cursor=-1":                     {err: true},
		"board_id=x":                    {err: true},
		"filter=%7B":                    {err: true},
		"q=" + strings.Repeat("a", 201): {err: true},
	} {
		got, err := parseTaskSearch(httptest.NewRequestWithContext(context.Background(), "GET", "/x?"+raw, nil))
		if (err != nil) != want.err {
			t.Errorf("%q: err %v", raw, err)
			continue
		}
		if !want.err && (got.sort != want.sort || got.desc != want.desc) {
			t.Errorf("%q: sort %q desc %v, want %q %v", raw, got.sort, got.desc, want.sort, want.desc)
		}
	}
}

func TestVisibleOnly(t *testing.T) {
	full, scoped, other := uuid.New(), uuid.New(), uuid.New()
	v := Visible{Full: map[uuid.UUID]perm.Bits{full: perm.ViewBoard}, Scoped: map[uuid.UUID]bool{scoped: true}, CreateOnly: map[uuid.UUID]bool{}, Invited: map[uuid.UUID]bool{}}
	if o, ok := v.Only(full); !ok || len(o.Full) != 1 || len(o.Scoped) != 0 {
		t.Fatalf("full: %v %v", o, ok)
	}
	if o, ok := v.Only(scoped); !ok || len(o.Full) != 0 || !o.Scoped[scoped] {
		t.Fatalf("scoped: %v %v", o, ok)
	}
	if _, ok := v.Only(other); ok {
		t.Fatal("a board not seen")
	}
}

func TestSortOrderKeepsEmptyLast(t *testing.T) {
	for _, s := range []string{"due", "assignee", "priority"} {
		for _, desc := range []bool{false, true} {
			if o := sortOrder(taskSearch{sort: s, desc: desc}, "false", nil); !strings.Contains(o, "NULLS LAST") {
				t.Errorf("%s desc=%v: %s", s, desc, o)
			}
		}
	}
}
