package connections

import (
	"database/sql"
	"fmt"
)

type DHBWAccount struct {
	UserID int64   `json:"-"`
	Name   *string `json:"name,omitempty"`
	Dualis *string `json:"-"`
	Mail   *string `json:"-"`
	Moodle *string `json:"-"`
}

func DHBWAccountByUser(conn *sql.DB, userID int64) (*DHBWAccount, error) {
	var acc DHBWAccount

	err := conn.QueryRow(
		"SELECT user_id, name, dualis, mail, moodle FROM user_dhbw_account WHERE user_id = ?",
		userID,
	).Scan(&acc.UserID, &acc.Name, &acc.Dualis, &acc.Mail, &acc.Moodle)
	if err != nil {
		return nil, err
	}

	return &acc, nil
}

func SetName(conn *sql.DB, userID int64, name *string) error {
	return set(conn, userID, "name", name)
}

func SetDualis(conn *sql.DB, userID int64, password *string) error {
	return set(conn, userID, "dualis", password)
}

func SetMail(conn *sql.DB, userID int64, password *string) error {
	return set(conn, userID, "mail", password)
}

func SetMoodle(conn *sql.DB, userID int64, password *string) error {
	return set(conn, userID, "moodle", password)
}

func UsersWith(conn *sql.DB, column string) ([]int64, error) {
	rows, err := conn.Query(fmt.Sprintf(
		"SELECT user_id FROM user_dhbw_account WHERE name IS NOT NULL AND %s IS NOT NULL ORDER BY user_id",
		column,
	))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		users = append(users, id)
	}

	return users, rows.Err()
}

func ClearPasswords(conn *sql.DB, userID int64) error {
	_, err := conn.Exec(`
		UPDATE user_dhbw_account
		SET dualis = NULL, mail = NULL, moodle = NULL, updated_at = datetime('now')
		WHERE user_id = ?`,
		userID,
	)
	return err
}

func set(conn *sql.DB, userID int64, column string, value *string) error {
	_, err := conn.Exec(fmt.Sprintf(`
		INSERT INTO user_dhbw_account (user_id, %[1]s) VALUES (?, ?)
		ON CONFLICT (user_id) DO UPDATE SET
			%[1]s = excluded.%[1]s,
			updated_at = datetime('now')`,
		column,
	), userID, value)
	return err
}
