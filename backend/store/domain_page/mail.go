package domainpage

import (
	"database/sql"
	"encoding/json"
	"strings"
)

const bodyRevision = 2

type MailMessage struct {
	ID             string   `json:"id"`
	OwnerID        int64    `json:"-"`
	EWSID          string   `json:"-"`
	Folder         string   `json:"folder"`
	ConversationID string   `json:"conversation_id"`
	Subject        string   `json:"subject"`
	SenderName     string   `json:"sender_name"`
	SenderEmail    string   `json:"sender_email"`
	To             []string `json:"to"`
	Cc             []string `json:"cc"`
	Received       string   `json:"received"`
	IsRead         bool     `json:"is_read"`
	HasAttachments bool     `json:"has_attachments"`
}

type MailDetail struct {
	MailMessage
	BodyLoaded     bool             `json:"body_loaded"`
	Body           string           `json:"body"`
	BodyHTML       string           `json:"body_html"`
	UnsubscribeURL string           `json:"unsubscribe_url"`
	Attachments    []MailAttachment `json:"attachments"`
}

type MailAttachment struct {
	ID          string  `json:"id"`
	EWSID       string  `json:"-"`
	MessageID   string  `json:"-"`
	Filename    string  `json:"filename"`
	ContentType string  `json:"content_type"`
	Size        int64   `json:"size"`
	ContentID   string  `json:"content_id"`
	IsInline    bool    `json:"is_inline"`
	Path        *string `json:"-"`
	Downloaded  bool    `json:"downloaded"`
	Position    int     `json:"-"`
}

type MailBody struct {
	MessageID      string
	To             []string
	Cc             []string
	Body           string
	BodyHTML       string
	UnsubscribeURL string
	Attachments    []MailAttachment
	Recipients     []MailRecipient
}

type MailRecipient struct {
	Kind  string
	Name  string
	Email string
}

type MailContactSource struct {
	Name  string
	Email string
	Sent  bool
	At    string
}

type MailFolder struct {
	ID       string  `json:"id"`
	EWSID    string  `json:"-"`
	ParentID *string `json:"parent_id"`
	Name     string  `json:"name"`
	Role     string  `json:"role"`
	Total    int     `json:"total"`
	Unread   int     `json:"unread"`
	Position int     `json:"-"`
}

const (
	mailMessageColumns    = "id, owner_id, ews_id, folder, conversation_id, subject, sender_name, sender_email, to_recipients, cc_recipients, received, is_read, has_attachments"
	mailAttachmentColumns = "id, ews_id, message_id, filename, content_type, size, content_id, is_inline, path, position"
	mailFolderColumns     = "f.id, f.ews_id, f.parent_id, f.name, f.role, f.position"
)

func MailFolders(conn *sql.DB, ownerID int64) ([]MailFolder, error) {
	rows, err := conn.Query(`
		SELECT `+mailFolderColumns+`, count(m.id), coalesce(sum(m.is_read = 0), 0)
		FROM mail_folders f
		LEFT JOIN mail_messages m ON m.owner_id = f.owner_id AND m.folder = f.id
		WHERE f.owner_id = ?
		GROUP BY f.id
		ORDER BY f.position`,
		ownerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	folders := []MailFolder{}
	for rows.Next() {
		var f MailFolder
		err := rows.Scan(&f.ID, &f.EWSID, &f.ParentID, &f.Name, &f.Role, &f.Position, &f.Total, &f.Unread)
		if err != nil {
			return nil, err
		}
		folders = append(folders, f)
	}

	return folders, rows.Err()
}

func MailFolderByRef(conn *sql.DB, ownerID int64, ref string) (*MailFolder, error) {
	var f MailFolder

	err := conn.QueryRow(`
		SELECT `+mailFolderColumns+` FROM mail_folders f
		WHERE f.owner_id = ? AND (f.id = ? OR (f.role <> '' AND f.role = ?))
		ORDER BY f.position LIMIT 1`,
		ownerID, ref, ref,
	).Scan(&f.ID, &f.EWSID, &f.ParentID, &f.Name, &f.Role, &f.Position)
	if err != nil {
		return nil, err
	}

	return &f, nil
}

func ReplaceMailFolders(conn *sql.DB, ownerID int64, folders []MailFolder, syncedAt string) error {
	tx, err := conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, f := range folders {
		_, err := tx.Exec(`
			INSERT INTO mail_folders (owner_id, id, ews_id, parent_id, name, role, position, synced_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (owner_id, id) DO UPDATE SET
				ews_id = excluded.ews_id,
				parent_id = excluded.parent_id,
				name = excluded.name,
				role = excluded.role,
				position = excluded.position,
				synced_at = excluded.synced_at`,
			ownerID, f.ID, f.EWSID, f.ParentID, f.Name, f.Role, f.Position, syncedAt,
		)
		if err != nil {
			return err
		}
	}

	_, err = tx.Exec("DELETE FROM mail_folders WHERE owner_id = ? AND synced_at <> ?", ownerID, syncedAt)
	if err != nil {
		return err
	}

	return tx.Commit()
}

type MailFilter struct {
	UnreadOnly      bool
	AttachmentsOnly bool
	Query           string
}

func (f MailFilter) clause() (string, []any) {
	where := ""
	args := []any{}

	if f.UnreadOnly {
		where += " AND is_read = 0"
	}
	if f.AttachmentsOnly {
		where += " AND has_attachments = 1"
	}
	if f.Query != "" {
		where += " AND (subject LIKE ? ESCAPE '\\' OR sender_name LIKE ? ESCAPE '\\' OR sender_email LIKE ? ESCAPE '\\')"
		like := "%" + escapeLike(f.Query) + "%"
		args = append(args, like, like, like)
	}

	return where, args
}

func escapeLike(value string) string {
	for _, char := range []string{"\\", "%", "_"} {
		value = strings.ReplaceAll(value, char, "\\"+char)
	}
	return value
}

func SetMailRead(conn *sql.DB, ownerID int64, id string, read bool) error {
	result, err := conn.Exec(
		"UPDATE mail_messages SET is_read = ? WHERE owner_id = ? AND id = ?",
		read, ownerID, id,
	)
	if err != nil {
		return err
	}

	return affectedOne(result)
}

func MailMessages(conn *sql.DB, ownerID int64, folder string, filter MailFilter, limit, offset int) ([]MailMessage, int, error) {
	where, args := filter.clause()
	scope := append([]any{ownerID, folder}, args...)

	var total int
	err := conn.QueryRow(
		"SELECT count(*) FROM mail_messages WHERE owner_id = ? AND folder = ?"+where,
		scope...,
	).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := conn.Query(
		"SELECT "+mailMessageColumns+" FROM mail_messages WHERE owner_id = ? AND folder = ?"+where+
			" ORDER BY received DESC LIMIT ? OFFSET ?",
		append(scope, limit, offset)...,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	messages := []MailMessage{}
	for rows.Next() {
		m, err := scanMailMessage(rows)
		if err != nil {
			return nil, 0, err
		}
		messages = append(messages, *m)
	}

	return messages, total, rows.Err()
}

func MailDetailByID(conn *sql.DB, ownerID int64, id string) (*MailDetail, error) {
	var detail MailDetail
	var to, cc string

	err := conn.QueryRow(
		"SELECT "+mailMessageColumns+", body_synced > 0, body, body_html, unsubscribe_url FROM mail_messages WHERE owner_id = ? AND id = ?",
		ownerID, id,
	).Scan(&detail.ID, &detail.OwnerID, &detail.EWSID, &detail.Folder, &detail.ConversationID,
		&detail.Subject, &detail.SenderName, &detail.SenderEmail, &to, &cc, &detail.Received,
		&detail.IsRead, &detail.HasAttachments, &detail.BodyLoaded, &detail.Body, &detail.BodyHTML, &detail.UnsubscribeURL)
	if err != nil {
		return nil, err
	}
	if err := decodeRecipients(&detail.MailMessage, to, cc); err != nil {
		return nil, err
	}

	attachments, err := mailAttachments(conn,
		"WHERE owner_id = ? AND message_id = ? ORDER BY position", ownerID, id)
	if err != nil {
		return nil, err
	}

	detail.Attachments = attachments
	return &detail, nil
}

func MailAttachmentByID(conn *sql.DB, ownerID int64, id string) (*MailAttachment, error) {
	attachments, err := mailAttachments(conn, "WHERE owner_id = ? AND id = ?", ownerID, id)
	if err != nil {
		return nil, err
	}
	if len(attachments) == 0 {
		return nil, sql.ErrNoRows
	}

	return &attachments[0], nil
}

func MailAttachmentPaths(conn *sql.DB, ownerID int64) (map[string]bool, error) {
	rows, err := conn.Query(
		"SELECT path FROM mail_attachments WHERE owner_id = ? AND path IS NOT NULL",
		ownerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	paths := map[string]bool{}
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		paths[p] = true
	}

	return paths, rows.Err()
}

func UpsertMailSummaries(conn *sql.DB, ownerID int64, messages []MailMessage, syncedAt string) error {
	tx, err := conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO mail_messages (owner_id, id, ews_id, folder, conversation_id, subject,
			sender_name, sender_email, to_recipients, received, is_read, has_attachments, synced_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (owner_id, id) DO UPDATE SET
			folder = excluded.folder,
			conversation_id = excluded.conversation_id,
			subject = excluded.subject,
			sender_name = excluded.sender_name,
			sender_email = excluded.sender_email,
			to_recipients = CASE WHEN mail_messages.body_synced > 0 THEN mail_messages.to_recipients ELSE excluded.to_recipients END,
			received = excluded.received,
			is_read = excluded.is_read,
			has_attachments = excluded.has_attachments,
			synced_at = excluded.synced_at`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, m := range messages {
		to, err := encodeList(m.To)
		if err != nil {
			return err
		}

		_, err = stmt.Exec(ownerID, m.ID, m.EWSID, m.Folder, m.ConversationID, m.Subject,
			m.SenderName, m.SenderEmail, to, m.Received, m.IsRead, m.HasAttachments, syncedAt)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func DeleteStaleMail(conn *sql.DB, ownerID int64, folder, syncedAt string) error {
	_, err := conn.Exec(
		"DELETE FROM mail_messages WHERE owner_id = ? AND folder = ? AND synced_at <> ?",
		ownerID, folder, syncedAt,
	)
	return err
}

func MailPendingBodies(conn *sql.DB, ownerID int64, folder string, all bool) ([]MailMessage, error) {
	rows, err := conn.Query(`
		SELECT id, ews_id FROM mail_messages
		WHERE owner_id = ? AND folder = ? AND (body_synced < ? OR ?)
		ORDER BY received DESC`,
		ownerID, folder, bodyRevision, all,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	pending := []MailMessage{}
	for rows.Next() {
		var m MailMessage
		if err := rows.Scan(&m.ID, &m.EWSID); err != nil {
			return nil, err
		}
		pending = append(pending, m)
	}

	return pending, rows.Err()
}

func StoreMailBodies(conn *sql.DB, ownerID int64, bodies []MailBody) error {
	tx, err := conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, b := range bodies {
		to, err := encodeList(b.To)
		if err != nil {
			return err
		}
		cc, err := encodeList(b.Cc)
		if err != nil {
			return err
		}

		_, err = tx.Exec(`
			UPDATE mail_messages SET body = ?, body_html = ?, unsubscribe_url = ?,
				to_recipients = ?, cc_recipients = ?, body_synced = ?
			WHERE owner_id = ? AND id = ?`,
			b.Body, b.BodyHTML, b.UnsubscribeURL, to, cc, bodyRevision, ownerID, b.MessageID,
		)
		if err != nil {
			return err
		}

		if err := storeRecipients(tx, ownerID, b.MessageID, b.Recipients); err != nil {
			return err
		}

		known, err := attachmentPaths(tx, ownerID, b.MessageID)
		if err != nil {
			return err
		}

		_, err = tx.Exec("DELETE FROM mail_attachments WHERE owner_id = ? AND message_id = ?", ownerID, b.MessageID)
		if err != nil {
			return err
		}

		for _, a := range b.Attachments {
			if a.Path == nil {
				a.Path = known[a.ID]
			}

			_, err := tx.Exec(`
				INSERT OR REPLACE INTO mail_attachments (owner_id, message_id, id, ews_id, filename,
					content_type, size, content_id, is_inline, path, position)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				ownerID, b.MessageID, a.ID, a.EWSID, a.Filename, a.ContentType, a.Size,
				a.ContentID, a.IsInline, a.Path, a.Position,
			)
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}

func MailPendingAttachments(conn *sql.DB, ownerID int64) ([]MailAttachment, error) {
	return mailAttachments(conn, "WHERE owner_id = ? AND path IS NULL AND is_inline = 0 ORDER BY message_id, position", ownerID)
}

func SetMailAttachmentPath(conn *sql.DB, ownerID int64, id, path string) error {
	_, err := conn.Exec("UPDATE mail_attachments SET path = ? WHERE owner_id = ? AND id = ?", path, ownerID, id)
	return err
}

func attachmentPaths(tx *sql.Tx, ownerID int64, messageID string) (map[string]*string, error) {
	rows, err := tx.Query(
		"SELECT id, path FROM mail_attachments WHERE owner_id = ? AND message_id = ? AND path IS NOT NULL",
		ownerID, messageID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	paths := map[string]*string{}
	for rows.Next() {
		var id string
		var p *string
		if err := rows.Scan(&id, &p); err != nil {
			return nil, err
		}
		paths[id] = p
	}

	return paths, rows.Err()
}

func mailAttachments(conn *sql.DB, where string, args ...any) ([]MailAttachment, error) {
	rows, err := conn.Query("SELECT "+mailAttachmentColumns+" FROM mail_attachments "+where, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	attachments := []MailAttachment{}
	for rows.Next() {
		var a MailAttachment
		err := rows.Scan(&a.ID, &a.EWSID, &a.MessageID, &a.Filename, &a.ContentType, &a.Size,
			&a.ContentID, &a.IsInline, &a.Path, &a.Position)
		if err != nil {
			return nil, err
		}

		a.Downloaded = a.Path != nil
		attachments = append(attachments, a)
	}

	return attachments, rows.Err()
}

func scanMailMessage(row rowScanner) (*MailMessage, error) {
	var m MailMessage
	var to, cc string

	err := row.Scan(&m.ID, &m.OwnerID, &m.EWSID, &m.Folder, &m.ConversationID, &m.Subject,
		&m.SenderName, &m.SenderEmail, &to, &cc, &m.Received, &m.IsRead, &m.HasAttachments)
	if err != nil {
		return nil, err
	}
	if err := decodeRecipients(&m, to, cc); err != nil {
		return nil, err
	}

	return &m, nil
}

func decodeRecipients(m *MailMessage, to, cc string) error {
	if err := json.Unmarshal([]byte(to), &m.To); err != nil {
		return err
	}
	if err := json.Unmarshal([]byte(cc), &m.Cc); err != nil {
		return err
	}
	if m.To == nil {
		m.To = []string{}
	}
	if m.Cc == nil {
		m.Cc = []string{}
	}

	return nil
}

func encodeList(list []string) (string, error) {
	if list == nil {
		list = []string{}
	}

	encoded, err := json.Marshal(list)
	return string(encoded), err
}

func storeRecipients(tx *sql.Tx, ownerID int64, messageID string, recipients []MailRecipient) error {
	if _, err := tx.Exec("DELETE FROM mail_recipients WHERE owner_id = ? AND message_id = ?", ownerID, messageID); err != nil {
		return err
	}

	rows := make([][]any, 0, len(recipients))
	for position, r := range recipients {
		rows = append(rows, []any{ownerID, messageID, position, r.Kind, r.Name, r.Email})
	}

	return execAll(tx, `
		INSERT INTO mail_recipients (owner_id, message_id, position, kind, name, email)
		VALUES (?, ?, ?, ?, ?, ?)`, rows)
}

func MailContactSources(conn *sql.DB, ownerID int64, sentRoles, skippedRoles []string) ([]MailContactSource, error) {
	args := []any{ownerID}
	for _, role := range sentRoles {
		args = append(args, role)
	}
	for _, role := range skippedRoles {
		args = append(args, role)
	}
	args = append(args, ownerID)
	for _, role := range sentRoles {
		args = append(args, role)
	}

	rows, err := conn.Query(`
		SELECT m.sender_name, m.sender_email, 0, m.received
		FROM mail_messages m
		JOIN mail_folders f ON f.owner_id = m.owner_id AND f.id = m.folder
		WHERE m.owner_id = ? AND f.role NOT IN (`+placeholders(len(sentRoles)+len(skippedRoles))+`)
		UNION ALL
		SELECT r.name, r.email, 1, m.received
		FROM mail_recipients r
		JOIN mail_messages m ON m.owner_id = r.owner_id AND m.id = r.message_id
		JOIN mail_folders f ON f.owner_id = m.owner_id AND f.id = m.folder
		WHERE r.owner_id = ? AND f.role IN (`+placeholders(len(sentRoles))+`)`,
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sources := []MailContactSource{}
	for rows.Next() {
		var s MailContactSource
		if err := rows.Scan(&s.Name, &s.Email, &s.Sent, &s.At); err != nil {
			return nil, err
		}
		sources = append(sources, s)
	}

	return sources, rows.Err()
}

func placeholders(n int) string {
	return strings.TrimSuffix(strings.Repeat("?, ", n), ", ")
}
