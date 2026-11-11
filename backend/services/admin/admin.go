package admin

import (
	"os"

	"home-v4/backend/services/auth"
	"home-v4/backend/services/connections"
	"home-v4/backend/services/db"
	"home-v4/backend/services/domain_page/calendar"
	"home-v4/backend/services/storage"
	"home-v4/backend/services/syncer"
	store "home-v4/backend/store/admin"
)

const walSuffix = "-wal"

type UserCounts struct {
	Total   int `json:"total"`
	Admins  int `json:"admins"`
	Pending int `json:"pending"`
	Locked  int `json:"locked"`
}

type StorageUsage struct {
	FilesBytes    int64 `json:"files_bytes"`
	DatabaseBytes int64 `json:"database_bytes"`
}

type Overview struct {
	Users   UserCounts        `json:"users"`
	Sync    *store.SyncHealth `json:"sync"`
	Storage StorageUsage      `json:"storage"`
}

type Connections struct {
	Name      bool `json:"name"`
	Dualis    bool `json:"dualis"`
	Mail      bool `json:"mail"`
	Moodle    bool `json:"moodle"`
	Timetable bool `json:"timetable"`
}

type UserDetail struct {
	User         auth.UserSummary   `json:"user"`
	Connections  Connections        `json:"connections"`
	DualisGuard  *connections.Guard `json:"dualis_guard"`
	Sync         []syncer.State     `json:"sync"`
	Sessions     []auth.Session     `json:"sessions"`
	Data         *store.DataCounts  `json:"data"`
	StorageBytes int64              `json:"storage_bytes"`
}

func GetOverview() (*Overview, error) {
	users, err := auth.ListUsers()
	if err != nil {
		return nil, err
	}

	var counts UserCounts
	for _, u := range users {
		counts.Total++
		if u.IsAdmin {
			counts.Admins++
		}
		if !u.Approved {
			counts.Pending++
		}
		if u.Locked {
			counts.Locked++
		}
	}

	health, err := store.Health(db.DB)
	if err != nil {
		return nil, err
	}

	files, err := storage.TotalUsage()
	if err != nil {
		return nil, err
	}

	return &Overview{
		Users:   counts,
		Sync:    health,
		Storage: StorageUsage{FilesBytes: files, DatabaseBytes: databaseSize()},
	}, nil
}

func Detail(name string) (*UserDetail, error) {
	user, err := auth.FindUser(name)
	if err != nil {
		return nil, err
	}

	users, err := auth.ListUsers()
	if err != nil {
		return nil, err
	}

	detail := &UserDetail{}
	for _, u := range users {
		if u.ID == user.ID {
			detail.User = u
		}
	}

	status, err := connections.StatusByUser(user.ID)
	if err != nil {
		return nil, err
	}
	timetable, err := calendar.TimetableCourse(user.ID)
	if err != nil {
		return nil, err
	}
	detail.Connections = Connections{
		Name:      status.Name != nil,
		Dualis:    status.Dualis,
		Mail:      status.Mail,
		Moodle:    status.Moodle,
		Timetable: timetable != nil,
	}
	detail.DualisGuard = status.DualisGuard

	if detail.Sync, err = syncer.States(user.ID); err != nil {
		return nil, err
	}
	if detail.Sessions, err = auth.Sessions(user.ID); err != nil {
		return nil, err
	}
	if detail.Data, err = store.Counts(db.DB, user.ID); err != nil {
		return nil, err
	}
	if detail.StorageBytes, err = storage.Usage(user.ID); err != nil {
		return nil, err
	}

	return detail, nil
}

func ResetDualis(name string) error {
	user, err := auth.FindUser(name)
	if err != nil {
		return err
	}

	return connections.ResetDualis(user.ID)
}

func databaseSize() int64 {
	path := os.Getenv("DB_PATH")

	var total int64
	for _, file := range []string{path, path + walSuffix} {
		if info, err := os.Stat(file); err == nil {
			total += info.Size()
		}
	}

	return total
}
