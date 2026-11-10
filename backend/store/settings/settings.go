package settings

import "database/sql"

type Settings struct {
	UserID int64
	Theme  string
}

func ByUser(conn *sql.DB, userID int64) (*Settings, error) {
	var settings Settings

	err := conn.QueryRow(
		"SELECT user_id, theme FROM user_settings WHERE user_id = ?",
		userID,
	).Scan(&settings.UserID, &settings.Theme)
	if err != nil {
		return nil, err
	}

	return &settings, nil
}

func SetTheme(conn *sql.DB, userID int64, theme string) error {
	result, err := conn.Exec(
		"UPDATE user_settings SET theme = ?, updated_at = datetime('now') WHERE user_id = ?",
		theme, userID,
	)
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
