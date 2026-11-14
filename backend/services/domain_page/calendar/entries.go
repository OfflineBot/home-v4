package calendar

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"
	"home-v4/libs/timetable"
)

type Category = store.CalendarCategory

type Item struct {
	ID          string `json:"id"`
	Source      string `json:"source"`
	CategoryID  string `json:"category_id"`
	Title       string `json:"title"`
	Start       string `json:"start"`
	End         string `json:"end"`
	Room        string `json:"room"`
	Description string `json:"description"`
	Mark        string `json:"mark"`
	Teacher     string `json:"teacher,omitempty"`
	Type        string `json:"type,omitempty"`
	Topic       string `json:"topic,omitempty"`
	Info        string `json:"info,omitempty"`
	IsOnline    bool   `json:"is_online"`
	IsCancelled bool   `json:"is_cancelled"`
}

type EventInput struct {
	ID          string `json:"id"`
	CategoryID  string `json:"category_id"`
	Title       string `json:"title"`
	Start       string `json:"start"`
	End         string `json:"end"`
	Room        string `json:"room"`
	Description string `json:"description"`
	Mark        string `json:"mark"`
	// "weekly" writes the event once a week for RepeatWeeks weeks; the
	// occurrences are plain entries that share title, weekday and time
	Repeat      string `json:"repeat"`
	RepeatWeeks int    `json:"repeat_weeks"`
}

type CategoryInput struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Color  string `json:"color"`
	Hidden bool   `json:"hidden"`
}

type Filter struct {
	Categories  []string
	Marks       []string
	Sources     []string
	VisibleOnly bool
}

const (
	SourceCustom        = "custom"
	MarkNormal          = "normal"
	MarkImportant       = "important"
	MarkHidden          = "hidden"
	RepeatNever  = ""
	RepeatWeekly = "weekly"

	minRepeatWeeks = 2
	maxRepeatWeeks = 52
	seriesAhead    = 400
	seriesBack     = 30

	timetableCategoryID = "timetable"
	timetableName       = "Uni"
	timetableColor      = "blue"
	localLayout         = "2006-01-02T15:04"
	maxTitle            = 300
	maxName             = 100
	maxText             = 10000
	idBytes             = 16
)

var (
	Marks   = []string{MarkNormal, MarkImportant, MarkHidden}
	Sources = []string{SourceCustom, Timetable}
)

var colorPattern = regexp.MustCompile(`^[a-z0-9#-]{1,32}$`)

var (
	ErrNotFound        = errors.New("calendar item not found")
	ErrInvalidEvent    = errors.New("invalid calendar event")
	ErrInvalidCategory = errors.New("invalid calendar category")
	ErrInvalidMark     = errors.New("invalid calendar mark")
	ErrInvalidFilter   = errors.New("invalid calendar filter")
	ErrProtected       = errors.New("calendar item is managed by a sync")
	ErrInvalidRepeat   = errors.New("invalid repeat")
)

func Categories(userID int64) ([]Category, error) {
	if err := ensureTimetableCategory(userID); err != nil {
		return nil, err
	}

	return store.CalendarCategories(db.DB, userID)
}

func SaveCategory(userID int64, in CategoryInput) (*Category, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" || utf8.RuneCountInString(name) > maxName || !colorPattern.MatchString(in.Color) {
		return nil, ErrInvalidCategory
	}

	category := Category{ID: in.ID, Name: name, Color: in.Color, Hidden: in.Hidden}
	if category.ID == "" {
		category.ID = newID()
	} else {
		existing, err := store.CalendarCategoryByID(db.DB, userID, category.ID)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		if err != nil {
			return nil, err
		}
		category.Source = existing.Source
	}

	if err := store.SaveCalendarCategory(db.DB, userID, category); err != nil {
		return nil, err
	}

	return store.CalendarCategoryByID(db.DB, userID, category.ID)
}

func DeleteCategory(userID int64, id string) error {
	category, err := store.CalendarCategoryByID(db.DB, userID, id)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if category.Source != "" {
		return ErrProtected
	}

	return store.DeleteCalendarCategory(db.DB, userID, id)
}

func Events(userID int64, from, to time.Time, filter Filter) ([]Item, error) {
	categories, err := Categories(userID)
	if err != nil {
		return nil, err
	}

	visible := map[string]bool{}
	for _, c := range categories {
		visible[c.ID] = !c.Hidden
	}

	synced, err := store.CalendarEvents(db.DB, userID, stamp(from), stamp(to))
	if err != nil {
		return nil, err
	}

	entries, err := store.CalendarEntries(db.DB, userID, stamp(from), stamp(to))
	if err != nil {
		return nil, err
	}

	items := make([]Item, 0, len(synced)+len(entries))
	for _, e := range synced {
		items = append(items, fromSynced(e))
	}
	for _, e := range entries {
		items = append(items, fromEntry(e))
	}

	items = slices.DeleteFunc(items, func(item Item) bool {
		return !filter.allows(item, visible)
	})
	slices.SortStableFunc(items, func(a, b Item) int {
		return strings.Compare(a.Start+a.End+a.Title, b.Start+b.End+b.Title)
	})

	return items, nil
}

func SaveEvent(userID int64, in EventInput) (*Item, error) {
	entry, err := validEntry(in)
	if err != nil {
		return nil, err
	}

	if _, err := store.CalendarCategoryByID(db.DB, userID, entry.CategoryID); errors.Is(err, sql.ErrNoRows) {
		return nil, ErrInvalidCategory
	} else if err != nil {
		return nil, err
	}

	if entry.ID == "" {
		entry.ID = newID()
	} else if err := customExists(userID, entry.ID); err != nil {
		return nil, err
	}

	if err := store.SaveCalendarEntry(db.DB, userID, *entry); err != nil {
		return nil, err
	}

	if in.ID == "" && in.Repeat == RepeatWeekly {
		if err := repeatWeekly(userID, *entry, in.RepeatWeeks); err != nil {
			return nil, err
		}
	}

	item := fromEntry(*entry)
	return &item, nil
}

// repeatWeekly writes the remaining occurrences as ordinary entries. They are
// not tied together by a column: sharing title, weekday and time is what makes
// them one series, which keeps every read path untouched.
func repeatWeekly(userID int64, first store.CalendarEntry, weeks int) error {
	for week := 1; week < weeks; week++ {
		next := first
		next.ID = newID()
		next.Start = shiftWeeks(first.Start, week)
		next.End = shiftWeeks(first.End, week)
		if next.Start == "" || next.End == "" {
			return ErrInvalidEvent
		}

		if err := store.SaveCalendarEntry(db.DB, userID, next); err != nil {
			return err
		}
	}

	return nil
}

// AddDate keeps the wall clock, so an occurrence stays at 17:00 across a
// daylight saving change instead of sliding by an hour.
func shiftWeeks(stored string, weeks int) string {
	at, err := time.Parse(time.RFC3339, stored)
	if err != nil {
		return ""
	}

	loc := timetable.Location()
	return stamp(at.In(loc).AddDate(0, 0, weeks*daysPerWeek))
}

// DeleteEvent removes one occurrence, or every later one of its series.
func DeleteEvent(userID int64, id string, series bool) error {
	if err := customExists(userID, id); err != nil {
		return err
	}
	if !series {
		return store.DeleteCalendarEntry(db.DB, userID, id)
	}

	entry, err := store.CalendarEntryByID(db.DB, userID, id)
	if err != nil {
		return err
	}

	from, err := time.Parse(time.RFC3339, entry.Start)
	if err != nil {
		return ErrInvalidEvent
	}

	later, err := store.CalendarEntries(db.DB, userID,
		stamp(from), stamp(from.AddDate(0, 0, seriesAhead)))
	if err != nil {
		return err
	}

	key := seriesKeyOf(*entry)
	for _, other := range later {
		if seriesKeyOf(other) != key {
			continue
		}
		if err := store.DeleteCalendarEntry(db.DB, userID, other.ID); err != nil {
			return err
		}
	}

	return nil
}

func SetMark(userID int64, id string, mark *string) error {
	if mark != nil && !slices.Contains(Marks, *mark) {
		return ErrInvalidMark
	}

	if _, err := store.CalendarEntryByID(db.DB, userID, id); err == nil {
		value := MarkNormal
		if mark != nil {
			value = *mark
		}
		return store.SetCalendarEntryMark(db.DB, userID, id, value)
	} else if !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	exists, err := store.CalendarEventExists(db.DB, userID, id)
	if err != nil {
		return err
	}
	if !exists {
		return ErrNotFound
	}

	return store.SetCalendarMark(db.DB, userID, id, mark)
}

func ParseFilter(categories, marks, sources, visible string) (Filter, error) {
	filter := Filter{
		Categories:  splitList(categories),
		Marks:       splitList(marks),
		Sources:     splitList(sources),
		VisibleOnly: visible == "true" || visible == "1",
	}

	for _, mark := range filter.Marks {
		if !slices.Contains(Marks, mark) {
			return Filter{}, ErrInvalidFilter
		}
	}
	for _, source := range filter.Sources {
		if !slices.Contains(Sources, source) {
			return Filter{}, ErrInvalidFilter
		}
	}
	if visible != "" && visible != "true" && visible != "1" && visible != "false" && visible != "0" {
		return Filter{}, ErrInvalidFilter
	}

	return filter, nil
}

func (f Filter) allows(item Item, visible map[string]bool) bool {
	shown, known := visible[item.CategoryID]
	switch {
	case !known:
		return false
	case f.VisibleOnly && !shown:
		return false
	case len(f.Categories) > 0 && !slices.Contains(f.Categories, item.CategoryID):
		return false
	case len(f.Marks) > 0 && !slices.Contains(f.Marks, item.Mark):
		return false
	case len(f.Sources) > 0 && !slices.Contains(f.Sources, item.Source):
		return false
	}

	return true
}

func ensureTimetableCategory(userID int64) error {
	return store.EnsureCalendarCategory(db.DB, userID, Category{
		ID:     timetableCategoryID,
		Name:   timetableName,
		Color:  timetableColor,
		Source: Timetable,
	})
}

func customExists(userID int64, id string) error {
	if _, err := store.CalendarEntryByID(db.DB, userID, id); err == nil {
		return nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	synced, err := store.CalendarEventExists(db.DB, userID, id)
	if err != nil {
		return err
	}
	if synced {
		return ErrProtected
	}

	return ErrNotFound
}

func validEntry(in EventInput) (*store.CalendarEntry, error) {
	if in.Repeat != RepeatNever && in.Repeat != RepeatWeekly {
		return nil, ErrInvalidRepeat
	}
	if in.Repeat == RepeatWeekly && (in.RepeatWeeks < minRepeatWeeks || in.RepeatWeeks > maxRepeatWeeks) {
		return nil, ErrInvalidRepeat
	}

	title := strings.TrimSpace(in.Title)
	if title == "" || utf8.RuneCountInString(title) > maxTitle ||
		utf8.RuneCountInString(in.Room) > maxTitle || utf8.RuneCountInString(in.Description) > maxText {
		return nil, ErrInvalidEvent
	}

	start, err := parseStamp(in.Start)
	if err != nil {
		return nil, ErrInvalidEvent
	}
	end, err := parseStamp(in.End)
	if err != nil || !end.After(start) {
		return nil, ErrInvalidEvent
	}

	mark := in.Mark
	if mark == "" {
		mark = MarkNormal
	}
	if !slices.Contains(Marks, mark) {
		return nil, ErrInvalidMark
	}

	return &store.CalendarEntry{
		ID:          in.ID,
		CategoryID:  in.CategoryID,
		Title:       title,
		Start:       stamp(start),
		End:         stamp(end),
		Room:        strings.TrimSpace(in.Room),
		Description: in.Description,
		Mark:        mark,
	}, nil
}

func parseStamp(raw string) (time.Time, error) {
	raw = strings.TrimSpace(raw)
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t, nil
	}

	return time.ParseInLocation(localLayout, raw, timetable.Location())
}

func fromSynced(e store.CalendarEvent) Item {
	mark := MarkNormal
	if e.Kind == examKind {
		mark = MarkImportant
	}
	if e.Mark != nil {
		mark = *e.Mark
	}

	var description []string
	for _, part := range []string{e.Topic, e.Info} {
		if part != "" {
			description = append(description, part)
		}
	}

	return Item{
		ID:          e.ID,
		Source:      e.Source,
		CategoryID:  timetableCategoryID,
		Title:       e.Title,
		Start:       e.Start,
		End:         e.End,
		Room:        e.Room,
		Description: strings.Join(description, "\n"),
		Mark:        mark,
		Teacher:     e.Teacher,
		Type:        e.Kind,
		Topic:       e.Topic,
		Info:        e.Info,
		IsOnline:    e.IsOnline,
		IsCancelled: e.IsCancelled,
	}
}

func fromEntry(e store.CalendarEntry) Item {
	return Item{
		ID:          e.ID,
		Source:      SourceCustom,
		CategoryID:  e.CategoryID,
		Title:       e.Title,
		Start:       e.Start,
		End:         e.End,
		Room:        e.Room,
		Description: e.Description,
		Mark:        e.Mark,
	}
}

func splitList(raw string) []string {
	var list []string
	for _, part := range strings.Split(raw, ",") {
		if part = strings.TrimSpace(part); part != "" {
			list = append(list, part)
		}
	}

	return list
}

func newID() string {
	raw := make([]byte, idBytes)
	rand.Read(raw)
	return hex.EncodeToString(raw)
}
