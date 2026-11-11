package timetable

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"
	_ "time/tzdata"
)

const (
	timeZone  = "Europe/Berlin"
	userAgent = "home-v4"
	sizeKey   = "size"
)

var APIBase = "https://api.dhbw.app"

var ErrNotFound = errors.New("dhbw.app resource not found")

var location = loadLocation()

var httpClient = &http.Client{Timeout: 30 * time.Second}

type Site struct {
	Site     string `json:"site"`
	Lectures string `json:"lectures"`
}

type Group struct {
	Faculty string   `json:"faculty"`
	Name    string   `json:"name"`
	Courses []string `json:"courses"`
}

type ID string

type Event struct {
	ID         ID        `json:"id"`
	EntityType string    `json:"entityType"`
	Start      time.Time `json:"startTime"`
	End        time.Time `json:"endTime"`
	Name       string    `json:"name"`
	Type       string    `json:"type"`
	Lecturer   string    `json:"lecturer"`
	Rooms      []string  `json:"rooms"`
	Course     string    `json:"course"`
	Kind       string    `json:"raplaKind"`
	EventNr    string    `json:"eventNr"`
	ModuleCode string    `json:"moduleCode"`
	Cancelled  bool      `json:"cancelled"`
	Unreleased bool      `json:"unreleased"`
}

func Location() *time.Location {
	return location
}

func Sites() ([]Site, error) {
	var sites []Site
	if err := get("/sites", &sites); err != nil {
		return nil, err
	}

	return sites, nil
}

func Courses(site string) ([]string, error) {
	var courses []string
	if err := get("/courses/"+url.PathEscape(site), &courses); err != nil {
		return nil, err
	}

	return courses, nil
}

func CourseGroups(site string) ([]Group, error) {
	var faculties map[string]map[string]json.RawMessage
	if err := get("/courses/"+url.PathEscape(site)+"/mapped", &faculties); err != nil {
		return nil, err
	}

	var groups []Group
	for faculty, programs := range faculties {
		for name, raw := range programs {
			if name == sizeKey {
				continue
			}

			var courses []string
			if err := json.Unmarshal(raw, &courses); err != nil {
				return nil, fmt.Errorf("parse courses of %s: %w", name, err)
			}
			groups = append(groups, Group{Faculty: faculty, Name: name, Courses: courses})
		}
	}

	return groups, nil
}

func Events(course string) ([]Event, error) {
	var events []Event
	if err := get("/rapla/lectures/"+url.PathEscape(course)+"/events?archived=true", &events); err != nil {
		return nil, err
	}

	return events, nil
}

func get(path string, target any) error {
	req, err := http.NewRequest(http.MethodGet, APIBase+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("dhbw.app request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusBadRequest {
		return ErrNotFound
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("dhbw.app returned status %d", resp.StatusCode)
	}

	if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
		return fmt.Errorf("dhbw.app parse failed: %w", err)
	}

	return nil
}

func (id *ID) UnmarshalJSON(raw []byte) error {
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		*id = ID(text)
		return nil
	}

	var number json.Number
	if err := json.Unmarshal(raw, &number); err != nil {
		return err
	}

	*id = ID(number.String())
	return nil
}

func loadLocation() *time.Location {
	loc, err := time.LoadLocation(timeZone)
	if err != nil {
		return time.UTC
	}
	return loc
}
