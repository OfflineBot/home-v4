package machine

import (
	"encoding/json"
	"testing"
)

func TestParseSessions(t *testing.T) {
	out := "0\t1\t1\t1794488996\t1794526172\n" +
		"work\t3\t0\t1794526331\t1794526331\n" +
		"\t1\t0\t1\t1\n" +
		"broken line\n"

	list := parseSessions(out)
	if len(list) != 2 {
		t.Fatalf("got %d sessions, want 2", len(list))
	}

	if list[0].Name != "0" || !list[0].Attached || list[0].Windows != 1 {
		t.Errorf("first session parsed as %+v", list[0])
	}
	if list[1].Name != "work" || list[1].Attached || list[1].Windows != 3 {
		t.Errorf("second session parsed as %+v", list[1])
	}
	if list[1].Created != 1794526331 {
		t.Errorf("created parsed as %d", list[1].Created)
	}
}

func TestParseSessionsEmpty(t *testing.T) {
	if list := parseSessions(""); len(list) != 0 {
		t.Fatalf("got %d sessions, want none", len(list))
	}
}

func TestTmuxEventShape(t *testing.T) {
	raw, err := json.Marshal(event{
		Type:     "tmux",
		Tmux:     "ok",
		Sessions: []TmuxSession{{Name: "work", Windows: 2, Attached: true}},
	})
	if err != nil {
		t.Fatal(err)
	}

	want := `{"type":"tmux","tmux":"ok","sessions":[{"name":"work","windows":2,"attached":true,"created":0,"activity":0}]}`
	if string(raw) != want {
		t.Fatalf("event is\n%s\nwant\n%s", raw, want)
	}
}
