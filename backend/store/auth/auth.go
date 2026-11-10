package auth

import (
	"database/sql"
	"time"
)

type User struct {
	ID           int64
	Name         string
	PasswordHash string
	IsAdmin      bool
}

func CountUsers(conn *sql.DB) (int, error) {
	var count int
	err := conn.QueryRow("SELECT count(*) FROM users").Scan(&count)
	return count, err
}

func CreateUser(conn *sql.DB, name, passwordHash string, isAdmin bool) error {
	_, err := conn.Exec(
		"INSERT INTO users (name, password_hash, is_admin) VALUES (?, ?, ?)",
		name, passwordHash, isAdmin,
	)
	return err
}

func UserByName(conn *sql.DB, name string) (*User, error) {
	return scanUser(conn.QueryRow(
		"SELECT id, name, password_hash, is_admin FROM users WHERE name = ?",
		name,
	))
}

func UserBySession(conn *sql.DB, tokenHash string) (*User, time.Time, error) {
	var user User
	var expires string

	err := conn.QueryRow(`
		SELECT u.id, u.name, u.password_hash, u.is_admin, s.expires_at
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
		tokenHash,
	).Scan(&user.ID, &user.Name, &user.PasswordHash, &user.IsAdmin, &expires)
	if err != nil {
		return nil, time.Time{}, err
	}

	expiresAt, err := time.ParseInLocation(time.DateTime, expires, time.UTC)
	if err != nil {
		return nil, time.Time{}, err
	}

	return &user, expiresAt, nil
}

func ExtendSession(conn *sql.DB, tokenHash string, expiresAt time.Time) error {
	_, err := conn.Exec(
		"UPDATE sessions SET expires_at = ? WHERE token_hash = ?",
		expiresAt.UTC().Format(time.DateTime), tokenHash,
	)
	return err
}

func CreateSession(conn *sql.DB, tokenHash string, userID int64, expiresAt time.Time) error {
	_, err := conn.Exec(
		"INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
		tokenHash, userID, expiresAt.UTC().Format(time.DateTime),
	)
	return err
}

func DeleteSession(conn *sql.DB, tokenHash string) error {
	_, err := conn.Exec("DELETE FROM sessions WHERE token_hash = ?", tokenHash)
	return err
}

func DeleteSessionsByUser(conn *sql.DB, userID int64) error {
	_, err := conn.Exec("DELETE FROM sessions WHERE user_id = ?", userID)
	return err
}

func DeleteExpiredSessions(conn *sql.DB) error {
	_, err := conn.Exec("DELETE FROM sessions WHERE expires_at <= datetime('now')")
	return err
}

func scanUser(row *sql.Row) (*User, error) {
	var user User
	if err := row.Scan(&user.ID, &user.Name, &user.PasswordHash, &user.IsAdmin); err != nil {
		return nil, err
	}
	return &user, nil
}
