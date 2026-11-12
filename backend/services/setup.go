
package services

import (
	"fmt"
	"home-v4/backend/services/auth"
	"home-v4/backend/services/connections"
	"home-v4/backend/services/db"
	"home-v4/backend/services/domain_page/automation"
	"home-v4/backend/services/domain_page/calendar"
	"home-v4/backend/services/domain_page/files"
	"home-v4/backend/services/domain_page/git"
	"home-v4/backend/services/domain_page/grades"
	"home-v4/backend/services/domain_page/lights"
	"home-v4/backend/services/domain_page/machine"
	"home-v4/backend/services/domain_page/mail"
	"home-v4/backend/services/domain_page/moodle"
	"home-v4/backend/services/domain_page/notify"
	"home-v4/backend/services/domain_page/pages"
	"home-v4/backend/services/domain_page/publicstore"
	"home-v4/backend/services/storage"
	"home-v4/backend/services/syncer"
	"time"
)

// / the entry point for all server startup tasks
func Setup() error {
	db.AddSchema("machine/schema.sql", machine.Schema)
	db.AddSchema("grades/schema.sql", grades.Schema)
	db.AddSchema("moodle/schema.sql", moodle.Schema)
	db.AddSchema("mail/schema.sql", mail.Schema)
	db.AddSchema("calendar/schema.sql", calendar.Schema)
	db.AddSchema("syncer/schema.sql", syncer.Schema)
	db.AddSchema("automation/schema.sql", automation.Schema)
	db.AddSchema("lights/schema.sql", lights.Schema)
	db.AddSchema("git/schema.sql", git.Schema)
	db.AddSchema("files/schema.sql", files.Schema)
	db.AddSchema("pages/schema.sql", pages.Schema)
	db.AddSchema("notify/schema.sql", notify.Schema)
	db.AddSchema("publicstore/schema.sql", publicstore.Schema)

	if err := db.Setup(); err != nil {
		return fmt.Errorf("Database setup failed with error: %w", err)
	}

	if err := storage.Setup(); err != nil {
		return fmt.Errorf("Storage setup failed with error: %w", err)
	}

	if err := files.Setup(); err != nil {
		return fmt.Errorf("Files setup failed with error: %w", err)
	}
	auth.OnDelete(files.ArchiveUser)

	if err := git.Setup(); err != nil {
		return fmt.Errorf("Git setup failed with error: %w", err)
	}
	auth.OnDelete(git.ArchiveUser)

	if err := auth.Setup(); err != nil {
		return fmt.Errorf("Auth setup failed with error: %w", err)
	}

	if err := connections.Setup(); err != nil {
		return fmt.Errorf("Connections setup failed with error: %w", err)
	}

	if err := automation.Setup(); err != nil {
		return fmt.Errorf("Automation setup failed with error: %w", err)
	}
	auth.OnDelete(automation.RemoveUser)

	registerSyncJobs()
	syncer.Start()

	return nil
}

func registerSyncJobs() {
	jobs := []struct {
		module   connections.Module
		interval time.Duration
		run      func(int64) error
		ready    func(int64) error
	}{
		{connections.Dualis, time.Hour, grades.Sync, connections.DualisReady},
		{connections.Mail, 15 * time.Minute, mail.Sync, nil},
		{connections.Moodle, 2 * time.Hour, moodle.Sync, nil},
	}

	for _, job := range jobs {
		syncer.Register(syncer.Job{
			Name:     string(job.module),
			Interval: job.interval,
			Users:    func() ([]int64, error) { return connections.UsersWith(job.module) },
			Run:      job.run,
			Ready:    job.ready,
			Classify: connections.ErrorCode,
		})
	}

	syncer.Register(syncer.Job{
		Name:     calendar.Timetable,
		Interval: time.Hour,
		Users:    calendar.Users,
		Run:      calendar.Sync,
		Classify: calendar.ErrorCode,
	})
}
