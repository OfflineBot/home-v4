package syncer

import (
	_ "embed"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"slices"
	"sync"
	"time"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/syncer"
)

//go:embed schema.sql
var Schema string

type Job struct {
	Name     string
	Interval time.Duration
	Users    func() ([]int64, error)
	Run      func(userID int64) error
	Ready    func(userID int64) error
	Classify func(error) string
}

type State struct {
	Job             string  `json:"job"`
	Running         bool    `json:"running"`
	StartedAt       *string `json:"started_at"`
	FinishedAt      *string `json:"finished_at"`
	SuccessAt       *string `json:"success_at"`
	Error           *string `json:"error"`
	IntervalMinutes int64   `json:"interval_minutes"`
	DefaultMinutes  int64   `json:"default_minutes"`
	MinMinutes      int64   `json:"min_minutes"`
	Custom          bool    `json:"custom"`
	NextRunAt       string  `json:"next_run_at"`
}

var (
	ErrUnknownJob      = errors.New("unknown sync job")
	ErrRunning         = errors.New("sync already running")
	ErrNotConfigured   = errors.New("sync not configured")
	ErrInvalidInterval = errors.New("invalid sync interval")
)

const (
	tick               = time.Minute
	MinIntervalMinutes = 5
	maxIntervalMinutes = math.MaxInt64 / int64(time.Minute)
)

type runKey struct {
	userID int64
	job    string
}

var (
	jobs    []Job
	mu      sync.Mutex
	running = map[runKey]bool{}
)

func Register(job Job) {
	jobs = append(jobs, job)
}

func Start() {
	for _, job := range jobs {
		go loop(job)
	}
}

func States(userID int64) ([]State, error) {
	states := make([]State, 0, len(jobs))

	for _, job := range jobs {
		saved, err := store.StateByUser(db.DB, userID, job.Name)
		if err != nil {
			return nil, err
		}

		minutes, custom, err := intervalMinutes(job, userID)
		if err != nil {
			return nil, err
		}

		states = append(states, State{
			Job:             job.Name,
			Running:         isRunning(userID, job.Name),
			StartedAt:       saved.StartedAt,
			FinishedAt:      saved.FinishedAt,
			SuccessAt:       saved.SuccessAt,
			Error:           saved.Error,
			IntervalMinutes: minutes,
			DefaultMinutes:  int64(job.Interval / time.Minute),
			MinMinutes:      MinIntervalMinutes,
			Custom:          custom,
			NextRunAt:       nextRun(saved.StartedAt, minutes).UTC().Format(time.RFC3339),
		})
	}

	return states, nil
}

func SetInterval(userID int64, name string, minutes *int64) error {
	if !slices.ContainsFunc(jobs, func(job Job) bool { return job.Name == name }) {
		return ErrUnknownJob
	}
	if minutes != nil && (*minutes < MinIntervalMinutes || *minutes > maxIntervalMinutes) {
		return ErrInvalidInterval
	}

	return store.SetIntervalMinutes(db.DB, userID, name, minutes)
}

func intervalMinutes(job Job, userID int64) (int64, bool, error) {
	custom, err := store.IntervalMinutes(db.DB, userID, job.Name)
	if err != nil {
		return 0, false, err
	}
	if custom != nil {
		return *custom, true, nil
	}

	return int64(job.Interval / time.Minute), false, nil
}

func nextRun(startedAt *string, minutes int64) time.Time {
	now := time.Now()
	if startedAt == nil {
		return now
	}

	started, err := time.Parse(time.RFC3339, *startedAt)
	if err != nil {
		return now
	}

	next := started.Add(time.Duration(minutes) * time.Minute)
	if next.Before(now) {
		return now
	}

	return next
}

func Trigger(userID int64, name string) error {
	index := slices.IndexFunc(jobs, func(job Job) bool { return job.Name == name })
	if index < 0 {
		return ErrUnknownJob
	}
	job := jobs[index]

	users, err := job.Users()
	if err != nil {
		return err
	}
	if !slices.Contains(users, userID) {
		return ErrNotConfigured
	}
	if job.Ready != nil {
		if err := job.Ready(userID); err != nil {
			return err
		}
	}
	if !claim(userID, job.Name) {
		return ErrRunning
	}

	go execute(job, userID)
	return nil
}

func loop(job Job) {
	ticker := time.NewTicker(tick)
	defer ticker.Stop()

	for {
		runDue(job)
		<-ticker.C
	}
}

func runDue(job Job) {
	users, err := job.Users()
	if err != nil {
		slog.Error("sync: listing users failed", "job", job.Name, "err", err)
		return
	}

	for _, userID := range users {
		if job.Ready != nil && job.Ready(userID) != nil {
			continue
		}

		due, err := isDue(job, userID)
		if err != nil {
			slog.Error("sync: reading state failed", "job", job.Name, "user", userID, "err", err)
			continue
		}
		if due && claim(userID, job.Name) {
			execute(job, userID)
		}
	}
}

func isDue(job Job, userID int64) (bool, error) {
	saved, err := store.StateByUser(db.DB, userID, job.Name)
	if err != nil {
		return false, err
	}
	if saved.StartedAt == nil {
		return true, nil
	}

	started, err := time.Parse(time.RFC3339, *saved.StartedAt)
	if err != nil || interrupted(saved, started) {
		return true, nil
	}

	minutes, _, err := intervalMinutes(job, userID)
	if err != nil {
		return false, err
	}

	return time.Since(started) >= time.Duration(minutes)*time.Minute, nil
}

func interrupted(saved *store.State, started time.Time) bool {
	if saved.FinishedAt == nil {
		return true
	}

	finished, err := time.Parse(time.RFC3339, *saved.FinishedAt)
	return err != nil || finished.Before(started)
}

func execute(job Job, userID int64) {
	defer release(userID, job.Name)

	if err := store.MarkStarted(db.DB, userID, job.Name, now()); err != nil {
		slog.Error("sync: marking start failed", "job", job.Name, "user", userID, "err", err)
		return
	}

	if err := run(job, userID); err != nil {
		code := job.Classify(err)
		slog.Warn("sync: job failed", "job", job.Name, "user", userID, "error", code, "err", err)

		if err := store.MarkFailed(db.DB, userID, job.Name, now(), code); err != nil {
			slog.Error("sync: marking failure failed", "job", job.Name, "user", userID, "err", err)
		}
		return
	}

	if err := store.MarkSucceeded(db.DB, userID, job.Name, now()); err != nil {
		slog.Error("sync: marking success failed", "job", job.Name, "user", userID, "err", err)
	}
}

func run(job Job, userID int64) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("panic: %v", recovered)
		}
	}()

	return job.Run(userID)
}

func claim(userID int64, job string) bool {
	mu.Lock()
	defer mu.Unlock()

	key := runKey{userID: userID, job: job}
	if running[key] {
		return false
	}

	running[key] = true
	return true
}

func release(userID int64, job string) {
	mu.Lock()
	defer mu.Unlock()

	delete(running, runKey{userID: userID, job: job})
}

func isRunning(userID int64, job string) bool {
	mu.Lock()
	defer mu.Unlock()

	return running[runKey{userID: userID, job: job}]
}

func now() string {
	return time.Now().UTC().Format(time.RFC3339)
}
