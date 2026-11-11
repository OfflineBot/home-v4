package calendar

import (
	"errors"
	"slices"
	"strconv"
	"strings"
	"time"

	"home-v4/libs/timetable"
)

type DayEvent struct {
	ID                string `json:"id"`
	Title             string `json:"title"`
	Start             string `json:"start"`
	End               string `json:"end"`
	Date              string `json:"date"`
	Weekday           string `json:"weekday"`
	StartTime         string `json:"start_time"`
	EndTime           string `json:"end_time"`
	DurationMinutes   int    `json:"duration_minutes"`
	MinutesUntilStart int    `json:"minutes_until_start"`
	MinutesUntilEnd   int    `json:"minutes_until_end"`
	Room              string `json:"room"`
	Teacher           string `json:"teacher"`
	Kind              string `json:"kind"`
	Category          string `json:"category"`
	Source            string `json:"source"`
	Mark              string `json:"mark"`
	Online            bool   `json:"online"`
	Cancelled         bool   `json:"cancelled"`
	Description       string `json:"description"`
}

type DaySummary struct {
	Date   string     `json:"date"`
	Label  string     `json:"label"`
	From   string     `json:"from"`
	To     string     `json:"to"`
	Events []DayEvent `json:"events"`
	First  *DayEvent  `json:"first"`
	Last   *DayEvent  `json:"last"`
}

type DayQuery struct {
	Day       string
	Source    string
	Cancelled bool
	Hidden    bool
	Important bool
}

const (
	dayLayout     = "2006-01-02"
	clockLayout   = "15:04"
	nextScanDays  = 14
	upcomingDays  = 30
	maxDaysAhead  = 365
	daysPerWeek   = 7
	sourceAll     = "all"
	labelToday    = "today"
	labelTomorrow = "tomorrow"
)

var ErrInvalidDay = errors.New("invalid calendar day")

func Day(userID int64, q DayQuery, now time.Time) (*DaySummary, error) {
	filter, err := dayFilter(q)
	if err != nil {
		return nil, err
	}

	loc := timetable.Location()
	today := midnight(now.In(loc))
	day := strings.TrimSpace(q.Day)

	if day == "next" {
		for offset := 1; offset <= nextScanDays; offset++ {
			from := today.AddDate(0, 0, offset)
			summary, err := summarize(userID, from, from.AddDate(0, 0, 1), filter, q, now, "next")
			if err != nil {
				return nil, err
			}
			if len(summary.Events) > 0 {
				return summary, nil
			}
		}
		from := today.AddDate(0, 0, 1)
		return summarize(userID, from, from.AddDate(0, 0, 1), filter, q, now, "next")
	}

	from, to, label, err := dayRange(day, today)
	if err != nil {
		return nil, err
	}

	return summarize(userID, from, to, filter, q, now, label)
}

func Upcoming(userID int64, q DayQuery, now time.Time) (*DayEvent, error) {
	filter, err := dayFilter(q)
	if err != nil {
		return nil, err
	}

	items, err := Events(userID, now.Add(-24*time.Hour), now.AddDate(0, 0, upcomingDays), filter)
	if err != nil {
		return nil, err
	}

	for _, item := range keep(items, q) {
		start, err := time.Parse(time.RFC3339, item.Start)
		if err == nil && start.After(now) {
			event := dayEvent(item, now)
			return &event, nil
		}
	}

	return nil, nil
}

func dayRange(day string, today time.Time) (time.Time, time.Time, string, error) {
	switch {
	case day == "" || day == labelToday:
		return today, today.AddDate(0, 0, 1), labelToday, nil
	case day == labelTomorrow:
		from := today.AddDate(0, 0, 1)
		return from, from.AddDate(0, 0, 1), labelTomorrow, nil
	case day == "week" || day == "nextWeek":
		monday := today.AddDate(0, 0, -((int(today.Weekday()) + 6) % daysPerWeek))
		if day == "nextWeek" {
			monday = monday.AddDate(0, 0, daysPerWeek)
		}
		return monday, monday.AddDate(0, 0, daysPerWeek), day, nil
	case strings.HasPrefix(day, "in:"):
		offset, err := strconv.Atoi(strings.TrimPrefix(day, "in:"))
		if err != nil || offset < 0 || offset > maxDaysAhead {
			return time.Time{}, time.Time{}, "", ErrInvalidDay
		}
		from := today.AddDate(0, 0, offset)
		return from, from.AddDate(0, 0, 1), day, nil
	}

	date, err := time.ParseInLocation(dayLayout, day, today.Location())
	if err != nil {
		return time.Time{}, time.Time{}, "", ErrInvalidDay
	}

	return date, date.AddDate(0, 0, 1), day, nil
}

func summarize(userID int64, from, to time.Time, filter Filter, q DayQuery, now time.Time, label string) (*DaySummary, error) {
	items, err := Events(userID, from, to, filter)
	if err != nil {
		return nil, err
	}

	summary := &DaySummary{
		Date:   from.Format(dayLayout),
		Label:  label,
		From:   from.Format(time.RFC3339),
		To:     to.Format(time.RFC3339),
		Events: []DayEvent{},
	}

	for _, item := range keep(items, q) {
		start, err := time.Parse(time.RFC3339, item.Start)
		if err != nil || start.Before(from) || !start.Before(to) {
			continue
		}
		summary.Events = append(summary.Events, dayEvent(item, now))
	}

	if len(summary.Events) > 0 {
		first := summary.Events[0]
		last := slices.MaxFunc(summary.Events, func(a, b DayEvent) int { return strings.Compare(a.End, b.End) })
		summary.First = &first
		summary.Last = &last
	}

	return summary, nil
}

func dayFilter(q DayQuery) (Filter, error) {
	filter := Filter{}

	switch q.Source {
	case "", Timetable:
		filter.Sources = []string{Timetable}
	case SourceCustom:
		filter.Sources = []string{SourceCustom}
	case sourceAll:
	default:
		return Filter{}, ErrInvalidFilter
	}

	switch {
	case q.Important:
		filter.Marks = []string{MarkImportant}
	case !q.Hidden:
		filter.Marks = []string{MarkNormal, MarkImportant}
	}

	return filter, nil
}

func keep(items []Item, q DayQuery) []Item {
	if q.Cancelled {
		return items
	}

	return slices.DeleteFunc(items, func(item Item) bool { return item.IsCancelled })
}

func dayEvent(item Item, now time.Time) DayEvent {
	loc := timetable.Location()
	start, _ := time.Parse(time.RFC3339, item.Start)
	end, _ := time.Parse(time.RFC3339, item.End)
	localStart := start.In(loc)

	return DayEvent{
		ID:                item.ID,
		Title:             item.Title,
		Start:             localStart.Format(time.RFC3339),
		End:               end.In(loc).Format(time.RFC3339),
		Date:              localStart.Format(dayLayout),
		Weekday:           localStart.Weekday().String(),
		StartTime:         localStart.Format(clockLayout),
		EndTime:           end.In(loc).Format(clockLayout),
		DurationMinutes:   int(end.Sub(start).Minutes()),
		MinutesUntilStart: int(start.Sub(now).Round(time.Minute).Minutes()),
		MinutesUntilEnd:   int(end.Sub(now).Round(time.Minute).Minutes()),
		Room:              item.Room,
		Teacher:           item.Teacher,
		Kind:              item.Type,
		Category:          item.CategoryID,
		Source:            item.Source,
		Mark:              item.Mark,
		Online:            item.IsOnline,
		Cancelled:         item.IsCancelled,
		Description:       item.Description,
	}
}

func midnight(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}
