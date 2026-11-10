package auth

import (
	"database/sql"
	"errors"
	"time"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/auth"
)

const maxLoginFailures = 10

var lockoutSteps = []time.Duration{
	1 * time.Minute,
	2 * time.Minute,
	10 * time.Minute,
}

var (
	ErrTooManyAttempts = errors.New("too many failed attempts")
	ErrAccountLocked   = errors.New("account locked, an admin has to unlock it")
)

func checkLockout(userID int64) error {
	lockout, err := store.LockoutByUser(db.DB, userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return err
	}

	if lockout.Permanent {
		return ErrAccountLocked
	}
	if time.Now().Before(lockout.LockedUntil) {
		return ErrTooManyAttempts
	}

	return nil
}

func recordFailure(userID int64) error {
	lockout, err := store.LockoutByUser(db.DB, userID)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		lockout = &store.Lockout{UserID: userID}
	}

	lockout.Failures++
	if lockout.Failures < maxLoginFailures {
		return store.SaveLockout(db.DB, lockout)
	}

	lockout.Failures = 0
	lockout.Level++

	if lockout.Level > len(lockoutSteps) {
		lockout.Permanent = true
		lockout.LockedUntil = time.Time{}

		if err := store.DeleteSessionsByUser(db.DB, userID); err != nil {
			return err
		}
	} else {
		lockout.LockedUntil = time.Now().Add(lockoutSteps[lockout.Level-1])
	}

	return store.SaveLockout(db.DB, lockout)
}

func clearFailures(userID int64) error {
	return store.DeleteLockout(db.DB, userID)
}
