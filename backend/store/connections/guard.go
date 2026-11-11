package connections

import (
	"database/sql"
	"errors"
)

type DualisGuard struct {
	Failures      int
	LastFailureAt *string
	NextAttemptAt *string
	Locked        bool
}

func DualisGuardByUser(conn *sql.DB, userID int64) (*DualisGuard, error) {
	var g DualisGuard

	err := conn.QueryRow(
		"SELECT failures, last_failure_at, next_attempt_at, locked FROM dualis_guard WHERE user_id = ?",
		userID,
	).Scan(&g.Failures, &g.LastFailureAt, &g.NextAttemptAt, &g.Locked)
	if errors.Is(err, sql.ErrNoRows) {
		return &DualisGuard{}, nil
	}
	if err != nil {
		return nil, err
	}

	return &g, nil
}

func SaveDualisGuard(conn *sql.DB, userID int64, g DualisGuard) error {
	_, err := conn.Exec(`
		INSERT INTO dualis_guard (user_id, failures, last_failure_at, next_attempt_at, locked)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT (user_id) DO UPDATE SET
			failures = excluded.failures,
			last_failure_at = excluded.last_failure_at,
			next_attempt_at = excluded.next_attempt_at,
			locked = excluded.locked`,
		userID, g.Failures, g.LastFailureAt, g.NextAttemptAt, g.Locked,
	)
	return err
}

func ResetDualisGuard(conn *sql.DB, userID int64) error {
	_, err := conn.Exec("DELETE FROM dualis_guard WHERE user_id = ?", userID)
	return err
}
