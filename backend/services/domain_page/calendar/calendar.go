package calendar

import (
	_ "embed"
	"errors"
	"fmt"
	"net"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"
	"home-v4/libs/timetable"
)

//go:embed schema.sql
var Schema string

type Event = store.CalendarEvent

type Site = timetable.Site

type CourseList struct {
	Site    string            `json:"site"`
	Courses []string          `json:"courses"`
	Groups  []timetable.Group `json:"groups"`
}

const (
	Timetable     = "timetable"
	maxRangeDays  = 400
	dateLayout    = "2006-01-02"
	cacheTTL      = 12 * time.Hour
	eventPrefix   = "dhbw-"
	examKind      = "Prüfung"
	otherKind     = "Sonstiger Termin"
	siteKind      = "Event"
	examSource    = "Pruefung"
	otherSource   = "SonstigerTermin"
	siteEntity    = "EVENT"
	onlineType    = "ONLINE"
	hybridType    = "HYBRID"
	siteCacheKey  = "sites"
	defaultEntity = "item"
)

var coursePattern = regexp.MustCompile(`^[A-ZÄÖÜ]{1,5}-[A-Z0-9]{2,15}$`)

var (
	ErrInvalidCourse = errors.New("invalid course id")
	ErrUnknownCourse = errors.New("course not found on dhbw.app")
	ErrInvalidRange  = errors.New("invalid calendar range")
	ErrNotConfigured = errors.New("timetable not configured")
	ErrVerifyFailed  = errors.New("timetable could not be verified")
)

type cacheEntry struct {
	value any
	at    time.Time
}

var (
	cacheMu sync.Mutex
	cache   = map[string]cacheEntry{}
)

func TimetableCourse(userID int64) (*string, error) {
	return store.CalendarSource(db.DB, userID, Timetable)
}

func NormalizeCourse(site, course string) (string, error) {
	site = strings.ToUpper(strings.TrimSpace(site))
	course = strings.ToUpper(strings.TrimSpace(course))
	if site != "" && !strings.Contains(course, "-") {
		course = site + "-" + course
	}
	if !coursePattern.MatchString(course) {
		return "", ErrInvalidCourse
	}

	return course, nil
}

func SetTimetable(userID int64, site, course string) error {
	id, err := NormalizeCourse(site, course)
	if err != nil {
		return err
	}

	list, err := Courses(strings.SplitN(id, "-", 2)[0])
	if errors.Is(err, timetable.ErrNotFound) {
		return ErrUnknownCourse
	}
	if err != nil {
		return fmt.Errorf("%w: %w", ErrVerifyFailed, err)
	}
	if !slices.Contains(list.Courses, id) {
		return ErrUnknownCourse
	}

	return store.SetCalendarSource(db.DB, userID, Timetable, id)
}

func RemoveTimetable(userID int64) error {
	return store.DeleteCalendarSource(db.DB, userID, Timetable)
}

func Users() ([]int64, error) {
	return store.CalendarSourceUsers(db.DB, Timetable)
}

func Sites() ([]Site, error) {
	return remember(siteCacheKey, timetable.Sites)
}

func Courses(site string) (*CourseList, error) {
	site = strings.ToUpper(strings.TrimSpace(site))
	if site == "" {
		return nil, ErrInvalidCourse
	}

	return remember("courses:"+site, func() (*CourseList, error) {
		courses, err := timetable.Courses(site)
		if err != nil {
			return nil, err
		}

		groups, err := timetable.CourseGroups(site)
		if err != nil {
			return nil, err
		}
		slices.SortFunc(groups, func(a, b timetable.Group) int {
			return strings.Compare(a.Faculty+"\n"+a.Name, b.Faculty+"\n"+b.Name)
		})
		slices.Sort(courses)

		return &CourseList{Site: site, Courses: courses, Groups: groups}, nil
	})
}

func Sync(userID int64) error {
	course, err := TimetableCourse(userID)
	if err != nil {
		return err
	}
	if course == nil {
		return ErrNotConfigured
	}

	fetched, err := timetable.Events(*course)
	if errors.Is(err, timetable.ErrNotFound) {
		return ErrUnknownCourse
	}
	if err != nil {
		return err
	}
	if len(fetched) == 0 {
		return nil
	}

	events := make([]Event, 0, len(fetched))
	for _, e := range fetched {
		events = append(events, toEvent(e))
	}

	return store.ReplaceAllCalendarEvents(db.DB, userID, Timetable, events)
}

func ParseRange(fromRaw, toRaw string) (time.Time, time.Time, error) {
	from, err := parseBound(fromRaw, false)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}

	to, err := parseBound(toRaw, true)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}

	if !to.After(from) || to.Sub(from) > maxRangeDays*24*time.Hour {
		return time.Time{}, time.Time{}, ErrInvalidRange
	}

	return from, to, nil
}

func ErrorCode(err error) string {
	var netErr net.Error

	switch {
	case errors.Is(err, ErrNotConfigured):
		return "not_configured"
	case errors.Is(err, ErrUnknownCourse):
		return "unknown_course"
	case errors.As(err, &netErr):
		return "unreachable"
	default:
		return "failed"
	}
}

func remember[T any](key string, load func() (T, error)) (T, error) {
	cacheMu.Lock()
	entry, ok := cache[key]
	cacheMu.Unlock()
	if ok && time.Since(entry.at) < cacheTTL {
		return entry.value.(T), nil
	}

	value, err := load()
	if err != nil {
		var zero T
		return zero, err
	}

	cacheMu.Lock()
	cache[key] = cacheEntry{value: value, at: time.Now()}
	cacheMu.Unlock()

	return value, nil
}

func parseBound(raw string, end bool) (time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}, ErrInvalidRange
	}

	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t, nil
	}

	day, err := time.ParseInLocation(dateLayout, raw, timetable.Location())
	if err != nil {
		return time.Time{}, ErrInvalidRange
	}
	if end {
		day = day.AddDate(0, 0, 1)
	}

	return day, nil
}

func toEvent(e timetable.Event) Event {
	end := e.End
	if end.Before(e.Start) {
		end = e.Start
	}

	return Event{
		ID:          eventPrefix + entityOf(e) + "-" + string(e.ID),
		Source:      Timetable,
		Start:       stamp(e.Start),
		End:         stamp(end),
		Title:       strings.TrimSpace(e.Name),
		Topic:       e.ModuleCode,
		Room:        strings.Join(e.Rooms, ", "),
		Teacher:     e.Lecturer,
		Kind:        kindOf(e),
		IsOnline:    e.Type == onlineType || e.Type == hybridType,
		IsCancelled: e.Cancelled,
	}
}

func entityOf(e timetable.Event) string {
	if e.EntityType == "" {
		return defaultEntity
	}

	return strings.ToLower(e.EntityType)
}

func kindOf(e timetable.Event) string {
	switch {
	case e.Kind == examSource:
		return examKind
	case e.Kind == otherSource:
		return otherKind
	case e.EntityType == siteEntity:
		return siteKind
	default:
		return ""
	}
}

func stamp(t time.Time) string {
	return t.UTC().Format(time.RFC3339)
}
