package syncer

import (
	"database/sql"
	"errors"
)

type State struct {
	StartedAt  *string
	FinishedAt *string
	SuccessAt  *string
	Error      *string
}

func StateByUser(conn *sql.DB, userID int64, job string) (*State, error) {
	var s State

	err := conn.QueryRow(
		"SELECT started_at, finished_at, success_at, error FROM sync_state WHERE user_id = ? AND job = ?",
		userID, job,
	).Scan(&s.StartedAt, &s.FinishedAt, &s.SuccessAt, &s.Error)
	if errors.Is(err, sql.ErrNoRows) {
		return &State{}, nil
	}
	if err != nil {
		return nil, err
	}

	return &s, nil
}

func MarkStarted(conn *sql.DB, userID int64, job, at string) error {
	_, err := conn.Exec(`
		INSERT INTO sync_state (user_id, job, started_at) VALUES (?, ?, ?)
		ON CONFLICT (user_id, job) DO UPDATE SET started_at = excluded.started_at`,
		userID, job, at,
	)
	return err
}

func MarkSucceeded(conn *sql.DB, userID int64, job, at string) error {
	_, err := conn.Exec(
		"UPDATE sync_state SET finished_at = ?, success_at = ?, error = NULL WHERE user_id = ? AND job = ?",
		at, at, userID, job,
	)
	return err
}

func MarkFailed(conn *sql.DB, userID int64, job, at, code string) error {
	_, err := conn.Exec(
		"UPDATE sync_state SET finished_at = ?, error = ? WHERE user_id = ? AND job = ?",
		at, code, userID, job,
	)
	return err
}

func IntervalMinutes(conn *sql.DB, userID int64, job string) (*int64, error) {
	var minutes int64

	err := conn.QueryRow(
		"SELECT interval_minutes FROM sync_settings WHERE user_id = ? AND job = ?",
		userID, job,
	).Scan(&minutes)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &minutes, nil
}

func SetIntervalMinutes(conn *sql.DB, userID int64, job string, minutes *int64) error {
	if minutes == nil {
		_, err := conn.Exec("DELETE FROM sync_settings WHERE user_id = ? AND job = ?", userID, job)
		return err
	}

	_, err := conn.Exec(`
		INSERT INTO sync_settings (user_id, job, interval_minutes) VALUES (?, ?, ?)
		ON CONFLICT (user_id, job) DO UPDATE SET interval_minutes = excluded.interval_minutes`,
		userID, job, *minutes,
	)
	return err
}
