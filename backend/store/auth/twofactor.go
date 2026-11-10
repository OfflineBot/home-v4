package auth

import "database/sql"

type TwoFactor struct {
	UserID      int64
	Secret      string
	LastCounter int64
	Confirmed   bool
}

func TwoFactorByUser(conn *sql.DB, userID int64) (*TwoFactor, error) {
	var twoFactor TwoFactor
	var confirmedAt sql.NullString

	err := conn.QueryRow(
		"SELECT user_id, secret, last_counter, confirmed_at FROM user_twofactor WHERE user_id = ?",
		userID,
	).Scan(&twoFactor.UserID, &twoFactor.Secret, &twoFactor.LastCounter, &confirmedAt)
	if err != nil {
		return nil, err
	}

	twoFactor.Confirmed = confirmedAt.Valid
	return &twoFactor, nil
}

func SetTwoFactorSecret(conn *sql.DB, userID int64, secret string) error {
	_, err := conn.Exec(`
		INSERT INTO user_twofactor (user_id, secret) VALUES (?, ?)
		ON CONFLICT (user_id) DO UPDATE SET
			secret = excluded.secret,
			last_counter = 0,
			confirmed_at = NULL`,
		userID, secret,
	)
	return err
}

func ConfirmTwoFactor(conn *sql.DB, userID, counter int64) error {
	result, err := conn.Exec(`
		UPDATE user_twofactor
		SET confirmed_at = datetime('now'), last_counter = ?
		WHERE user_id = ? AND confirmed_at IS NULL`,
		counter, userID,
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

func SetTwoFactorCounter(conn *sql.DB, userID, counter int64) error {
	_, err := conn.Exec(
		"UPDATE user_twofactor SET last_counter = ? WHERE user_id = ?",
		counter, userID,
	)
	return err
}

func DeleteTwoFactor(conn *sql.DB, userID int64) error {
	_, err := conn.Exec("DELETE FROM user_twofactor WHERE user_id = ?", userID)
	return err
}
