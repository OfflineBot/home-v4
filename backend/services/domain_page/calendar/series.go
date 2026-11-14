package calendar

import (
	"slices"
	"strings"
	"time"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"
	"home-v4/libs/timetable"
)

// Series is one pickable repeating event. Automation triggers name a series by
// its key, which is why the key is readable instead of an id: the occurrences
// of a weekly event are separate rows that only share title, weekday and time.
type Series struct {
	Key       string `json:"key"`
	Title     string `json:"title"`
	Weekday   string `json:"weekday"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
	Count     int    `json:"count"`
	Next      string `json:"next"`
}

const seriesSeparator = "|"

func seriesKeyOf(entry store.CalendarEntry) string {
	at, err := time.Parse(time.RFC3339, entry.Start)
	if err != nil {
		return entry.Title
	}

	local := at.In(timetable.Location())
	return strings.Join([]string{
		entry.Title,
		local.Weekday().String(),
		local.Format(clockLayout),
	}, seriesSeparator)
}

// SeriesList groups the user's own events into series: one per title, weekday
// and time, plus a looser one per title that happens on more than one weekday.
func SeriesList(userID int64, now time.Time) ([]Series, error) {
	loc := timetable.Location()
	today := midnight(now.In(loc))

	entries, err := store.CalendarEntries(db.DB, userID,
		stamp(today.AddDate(0, 0, -seriesBack)),
		stamp(today.AddDate(0, 0, seriesAhead)))
	if err != nil {
		return nil, err
	}

	order := []string{}
	byKey := map[string]*Series{}
	titles := map[string]int{}

	for _, entry := range entries {
		start, err := time.Parse(time.RFC3339, entry.Start)
		if err != nil {
			continue
		}
		local := start.In(loc)
		end, err := time.Parse(time.RFC3339, entry.End)
		if err != nil {
			continue
		}

		key := seriesKeyOf(entry)
		found, known := byKey[key]
		if !known {
			found = &Series{
				Key:       key,
				Title:     entry.Title,
				Weekday:   local.Weekday().String(),
				StartTime: local.Format(clockLayout),
				EndTime:   end.In(loc).Format(clockLayout),
			}
			byKey[key] = found
			order = append(order, key)
			titles[entry.Title]++
		}

		found.Count++
		if local.After(now) && (found.Next == "" || local.Format(time.RFC3339) < found.Next) {
			found.Next = local.Format(time.RFC3339)
		}
	}

	list := make([]Series, 0, len(order))
	for _, key := range order {
		list = append(list, *byKey[key])
	}

	slices.SortStableFunc(list, func(a, b Series) int {
		if a.Title != b.Title {
			return strings.Compare(a.Title, b.Title)
		}
		if a.Weekday != b.Weekday {
			return weekdayIndex(a.Weekday) - weekdayIndex(b.Weekday)
		}
		return strings.Compare(a.StartTime, b.StartTime)
	})

	// a title on several weekdays can also be picked as a whole, so "every
	// time I work" does not have to be wired up twice
	whole := []Series{}
	for title, count := range titles {
		if count < 2 {
			continue
		}
		total := 0
		next := ""
		for _, entry := range list {
			if entry.Title != title {
				continue
			}
			total += entry.Count
			if entry.Next != "" && (next == "" || entry.Next < next) {
				next = entry.Next
			}
		}
		whole = append(whole, Series{Key: title, Title: title, Count: total, Next: next})
	}
	slices.SortFunc(whole, func(a, b Series) int { return strings.Compare(a.Title, b.Title) })

	return append(whole, list...), nil
}

var weekdays = []string{
	time.Monday.String(),
	time.Tuesday.String(),
	time.Wednesday.String(),
	time.Thursday.String(),
	time.Friday.String(),
	time.Saturday.String(),
	time.Sunday.String(),
}

func weekdayIndex(name string) int {
	return slices.Index(weekdays, name)
}
