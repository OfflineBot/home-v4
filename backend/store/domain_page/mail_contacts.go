package domainpage

import "database/sql"

type MailContact struct {
	Email    string `json:"email"`
	Name     string `json:"name"`
	Search   string `json:"-"`
	Sent     int    `json:"sent"`
	Received int    `json:"received"`
	LastAt   string `json:"last_at"`
}

func ReplaceMailContacts(conn *sql.DB, ownerID int64, contacts []MailContact) error {
	tx, err := conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM mail_contacts WHERE owner_id = ?", ownerID); err != nil {
		return err
	}

	rows := make([][]any, 0, len(contacts))
	for _, c := range contacts {
		rows = append(rows, []any{ownerID, c.Email, c.Name, c.Search, c.Sent, c.Received, c.LastAt})
	}

	err = execAll(tx, `
		INSERT OR REPLACE INTO mail_contacts (owner_id, email, name, search, sent, received, last_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`, rows)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func MailContactsMatching(conn *sql.DB, ownerID int64, pattern string, limit int) ([]MailContact, error) {
	rows, err := conn.Query(`
		SELECT email, name, search, sent, received, last_at FROM mail_contacts
		WHERE owner_id = ? AND search LIKE ? ESCAPE '\'
		ORDER BY sent DESC, received DESC, last_at DESC, email
		LIMIT ?`,
		ownerID, pattern, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	contacts := []MailContact{}
	for rows.Next() {
		var c MailContact
		if err := rows.Scan(&c.Email, &c.Name, &c.Search, &c.Sent, &c.Received, &c.LastAt); err != nil {
			return nil, err
		}
		contacts = append(contacts, c)
	}

	return contacts, rows.Err()
}
