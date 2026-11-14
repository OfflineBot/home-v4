package lights

import "testing"

func TestSleepDurationIsBounded(t *testing.T) {
	for _, minutes := range []int{0, -5, 256, 1000} {
		if _, err := StartSleep(1, minutes, true); err != ErrInvalidSleep {
			t.Errorf("StartSleep(%d) = %v; want ErrInvalidSleep", minutes, err)
		}
	}
}

func TestTimersStartedTogetherBecomeOneEntry(t *testing.T) {
	running := []Timer{
		{Lights: []int64{1}, Name: "Desk", SleepIn: 1798, Fade: true},
		{Lights: []int64{2}, Name: "Shelf", SleepIn: 1800, Fade: true},
		{Lights: []int64{3}, Name: "Plug", SleepIn: 240},
	}

	groups := groupTimers(running, 3)
	if len(groups) != 2 {
		t.Fatalf("groupTimers gave %d entries; want 2", len(groups))
	}
	if got := len(groups[0].Lights); got != 2 {
		t.Errorf("first entry covers %d lights; want 2", got)
	}
	if groups[0].Name != "2 lights" {
		t.Errorf("first entry is named %q; want \"2 lights\"", groups[0].Name)
	}
	if groups[0].SleepIn != 1800 {
		t.Errorf("first entry ends in %d s; want 1800", groups[0].SleepIn)
	}
	if groups[1].Name != "Plug" {
		t.Errorf("second entry is named %q; want \"Plug\"", groups[1].Name)
	}
}

func TestOneTimerForEveryLightIsNamedForTheRoom(t *testing.T) {
	groups := groupTimers([]Timer{
		{Lights: []int64{1}, Name: "Desk", SleepIn: 600},
		{Lights: []int64{2}, Name: "Shelf", SleepIn: 600},
	}, 2)

	if len(groups) != 1 || groups[0].Name != "All lights" {
		t.Fatalf("groupTimers gave %+v; want one \"All lights\" entry", groups)
	}
}
