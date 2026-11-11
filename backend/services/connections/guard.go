package connections

import (
	"errors"
	"net"
	"sync"
	"time"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/connections"
	"home-v4/libs/dualis"
)

const MaxDualisFailures = 5

var dualisBackoff = []time.Duration{15 * time.Minute, time.Hour, 12 * time.Hour, 24 * time.Hour}

var (
	ErrDualisLocked  = errors.New("dualis login locked after repeated failures")
	ErrDualisBackoff = errors.New("dualis login paused after a failure")
)

type Guard struct {
	Failures      int     `json:"failures"`
	MaxFailures   int     `json:"max_failures"`
	Locked        bool    `json:"locked"`
	NextAttemptAt *string `json:"next_attempt_at"`
	LastFailureAt *string `json:"last_failure_at"`
}

var dualisMu sync.Mutex

var dualisSignIn = dualis.Login

func DualisGuard(userID int64) (*Guard, error) {
	g, err := store.DualisGuardByUser(db.DB, userID)
	if err != nil {
		return nil, err
	}

	return &Guard{
		Failures:      g.Failures,
		MaxFailures:   MaxDualisFailures,
		Locked:        g.Locked,
		NextAttemptAt: g.NextAttemptAt,
		LastFailureAt: g.LastFailureAt,
	}, nil
}

func DualisReady(userID int64) error {
	g, err := store.DualisGuardByUser(db.DB, userID)
	if err != nil {
		return err
	}

	return blocked(g, true)
}

func ResetDualis(userID int64) error {
	dualisMu.Lock()
	defer dualisMu.Unlock()

	return store.ResetDualisGuard(db.DB, userID)
}

func dualisLogin(userID int64, username, password string, scheduled bool) (*dualis.Session, error) {
	dualisMu.Lock()
	defer dualisMu.Unlock()

	g, err := store.DualisGuardByUser(db.DB, userID)
	if err != nil {
		return nil, err
	}
	if err := blocked(g, scheduled); err != nil {
		return nil, err
	}

	sess, err := dualisSignIn(username, password)
	switch {
	case err == nil && (g.Failures > 0 || g.Locked):
		if resetErr := store.ResetDualisGuard(db.DB, userID); resetErr != nil {
			return nil, resetErr
		}
	case err != nil && !unreachable(err):
		if saveErr := store.SaveDualisGuard(db.DB, userID, failed(*g, time.Now())); saveErr != nil {
			return nil, saveErr
		}
	}

	return sess, err
}

func unreachable(err error) bool {
	var netErr net.Error
	return errors.As(err, &netErr)
}

func blocked(g *store.DualisGuard, scheduled bool) error {
	if g.Locked {
		return ErrDualisLocked
	}
	if !scheduled || g.NextAttemptAt == nil {
		return nil
	}

	next, err := time.Parse(time.RFC3339, *g.NextAttemptAt)
	if err == nil && time.Now().Before(next) {
		return ErrDualisBackoff
	}

	return nil
}

func failed(g store.DualisGuard, now time.Time) store.DualisGuard {
	g.Failures++
	last := now.UTC().Format(time.RFC3339)
	g.LastFailureAt = &last

	if g.Failures >= MaxDualisFailures {
		g.Locked = true
		g.NextAttemptAt = nil
		return g
	}

	next := now.Add(dualisBackoff[g.Failures-1]).UTC().Format(time.RFC3339)
	g.NextAttemptAt = &next
	return g
}
