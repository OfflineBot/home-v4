package calendar

import (
	"testing"
	"time"

	store "home-v4/backend/store/domain_page"
	"home-v4/libs/timetable"
)

func TestWeeklyOccurrencesKeepTheWallClock(t *testing.T) {
	loc := timetable.Location()
	// the last Thursday of summer time in 2026: the clocks go back on the 25th
	start := time.Date(2026, 10, 22, 17, 0, 0, 0, loc)

	shifted := shiftWeeks(stamp(start), 1)
	at, err := time.Parse(time.RFC3339, shifted)
	if err != nil {
		t.Fatalf("shiftWeeks gave %q: %v", shifted, err)
	}

	local := at.In(loc)
	if local.Hour() != 17 || local.Minute() != 0 {
		t.Errorf("occurrence is at %s; want 17:00", local.Format("15:04"))
	}
	if local.Weekday() != time.Thursday || local.Day() != 29 {
		t.Errorf("occurrence is on %s; want Thursday the 29th", local.Format("Mon 2"))
	}
}

func TestSeriesKeyIsTitleWeekdayAndTime(t *testing.T) {
	loc := timetable.Location()
	entry := store.CalendarEntry{
		Title: "Work",
		Start: stamp(time.Date(2026, 11, 12, 17, 0, 0, 0, loc)),
	}

	if got := seriesKeyOf(entry); got != "Work|Thursday|17:00" {
		t.Errorf("seriesKeyOf = %q; want \"Work|Thursday|17:00\"", got)
	}
}
