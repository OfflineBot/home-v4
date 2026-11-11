package auth

import (
	"database/sql"
	"time"
)

type UserSummary struct {
	ID        int64
	Name      string
	IsAdmin   bool
	Approved  bool
	TwoFactor bool
	Locked    bool
	CreatedAt time.Time
}

func ListUsers(conn *sql.DB) ([]UserSummary, error) {
	rows, err := conn.Query(`
		SELECT u.id, u.name, u.is_admin, u.approved_at IS NOT NULL,
			tf.confirmed_at IS NOT NULL,
			(COALESCE(l.permanent, 0) = 1
				OR COALESCE(l.locked_until, '') > datetime('now')),
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
			&user.TwoFactor, &user.Locked, &createdAt)
		if err != nil {
			return nil, err
		}

		user.CreatedAt, err = time.ParseInLocation(time.DateTime, createdAt, time.UTC)
		if err != nil {
			return nil, err
		}

		users = append(users, user)
	}

	return users, rows.Err()
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
