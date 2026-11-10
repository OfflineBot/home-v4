package auth

import (
	"database/sql"
	"time"
)

type Lockout struct {
	UserID      int64
	Failures    int
	Level       int
	LockedUntil time.Time
	Permanent   bool
}

func LockoutByUser(conn *sql.DB, userID int64) (*Lockout, error) {
	var lockout Lockout
	var lockedUntil sql.NullString

	err := conn.QueryRow(`
		SELECT user_id, failures, level, locked_until, permanent
		FROM user_lockouts WHERE user_id = ?`,
		userID,
	).Scan(&lockout.UserID, &lockout.Failures, &lockout.Level, &lockedUntil, &lockout.Permanent)
	if err != nil {
		return nil, err
	}

	if lockedUntil.Valid {
		parsed, err := time.ParseInLocation(time.DateTime, lockedUntil.String, time.UTC)
		if err != nil {
			return nil, err
		}
		lockout.LockedUntil = parsed
	}

	return &lockout, nil
}

func SaveLockout(conn *sql.DB, lockout *Lockout) error {
	var lockedUntil any
	if !lockout.LockedUntil.IsZero() {
		lockedUntil = lockout.LockedUntil.UTC().Format(time.DateTime)
	}

	_, err := conn.Exec(`
		INSERT INTO user_lockouts (user_id, failures, level, locked_until, permanent)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT (user_id) DO UPDATE SET
			failures = excluded.failures,
			level = excluded.level,
			locked_until = excluded.locked_until,
			permanent = excluded.permanent,
			updated_at = datetime('now')`,
		lockout.UserID, lockout.Failures, lockout.Level, lockedUntil, lockout.Permanent,
	)
	return err
}

func DeleteLockout(conn *sql.DB, userID int64) error {
	_, err := conn.Exec("DELETE FROM user_lockouts WHERE user_id = ?", userID)
	return err
}
