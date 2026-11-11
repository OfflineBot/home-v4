package auth

import (
	"database/sql"
	"time"
)

type UserSummary struct {
	ID                int64     `json:"id"`
	Name              string    `json:"name"`
	IsAdmin           bool      `json:"is_admin"`
	Approved          bool      `json:"approved"`
	TwoFactor         bool      `json:"two_factor"`
	Locked            bool      `json:"locked"`
	LockedPermanently bool      `json:"locked_permanently"`
	LockedUntil       *string   `json:"locked_until"`
	LoginFailures     int       `json:"login_failures"`
	Sessions          int       `json:"sessions"`
	LastSessionAt     *string   `json:"last_session_at"`
	CreatedAt         time.Time `json:"created_at"`
}

type Session struct {
	CreatedAt string `json:"created_at"`
	ExpiresAt string `json:"expires_at"`
}

func ListUsers(conn *sql.DB) ([]UserSummary, error) {
	rows, err := conn.Query(`
		SELECT u.id, u.name, u.is_admin, u.approved_at IS NOT NULL,
			tf.confirmed_at IS NOT NULL,
			(COALESCE(l.permanent, 0) = 1
				OR COALESCE(l.locked_until, '') > datetime('now')),
			COALESCE(l.permanent, 0) = 1,
			CASE WHEN COALESCE(l.locked_until, '') > datetime('now') THEN l.locked_until END,
			COALESCE(l.failures, 0),
			(SELECT count(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > datetime('now')),
			(SELECT max(s.created_at) FROM sessions s WHERE s.user_id = u.id),
			u.created_at
		FROM users u
		LEFT JOIN user_twofactor tf ON tf.user_id = u.id
		LEFT JOIN user_lockouts l ON l.user_id = u.id
		ORDER BY u.created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := []UserSummary{}
	for rows.Next() {
		var user UserSummary
		var createdAt string

		err := rows.Scan(&user.ID, &user.Name, &user.IsAdmin, &user.Approved,
			&user.TwoFactor, &user.Locked, &user.LockedPermanently, &user.LockedUntil,
			&user.LoginFailures, &user.Sessions, &user.LastSessionAt, &createdAt)
		if err != nil {
			return nil, err
		}

		user.CreatedAt, err = time.ParseInLocation(time.DateTime, createdAt, time.UTC)
		if err != nil {
			return nil, err
		}
		user.LockedUntil = rfc3339(user.LockedUntil)
		user.LastSessionAt = rfc3339(user.LastSessionAt)

		users = append(users, user)
	}

	return users, rows.Err()
}

func SessionsByUser(conn *sql.DB, userID int64) ([]Session, error) {
	rows, err := conn.Query(`
		SELECT created_at, expires_at FROM sessions
		WHERE user_id = ? AND expires_at > datetime('now')
		ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sessions := []Session{}
	for rows.Next() {
		var created, expires string
		if err := rows.Scan(&created, &expires); err != nil {
			return nil, err
		}
		sessions = append(sessions, Session{CreatedAt: *rfc3339(&created), ExpiresAt: *rfc3339(&expires)})
	}

	return sessions, rows.Err()
}

func rfc3339(value *string) *string {
	if value == nil {
		return nil
	}

	parsed, err := time.ParseInLocation(time.DateTime, *value, time.UTC)
	if err != nil {
		return value
	}

	formatted := parsed.Format(time.RFC3339)
	return &formatted
}

func CountAdmins(conn *sql.DB) (int, error) {
	var count int
	err := conn.QueryRow("SELECT count(*) FROM users WHERE is_admin = 1").Scan(&count)
	return count, err
}

func DeleteUser(conn *sql.DB, userID int64) error {
	return affectOne(conn.Exec("DELETE FROM users WHERE id = ?", userID))
}

func RevokeApproval(conn *sql.DB, userID int64) error {
	return affectOne(conn.Exec(
		"UPDATE users SET approved_at = NULL WHERE id = ? AND approved_at IS NOT NULL",
		userID,
	))
}

func SetAdmin(conn *sql.DB, userID int64, isAdmin bool) error {
	return affectOne(conn.Exec(
		"UPDATE users SET is_admin = ? WHERE id = ? AND is_admin != ?",
		isAdmin, userID, isAdmin,
	))
}

func affectOne(result sql.Result, err error) error {
	if err != nil {
		return err
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return sql.ErrNoRows
	}

	return nil
}
