package domainpage

import (
	"database/sql"
	"strings"
)

type MailExportRow struct {
	MailMessage
	FolderName string
	FolderRole string
	Body       string
	BodyHTML   string
	BodyLoaded bool
}

type MailCursor struct {
	Received string
	ID       string
}

const mailExportColumns = `m.id, m.owner_id, m.ews_id, m.folder, m.conversation_id, m.subject, m.sender_name, m.sender_email,
	m.to_recipients, m.cc_recipients, m.received, m.is_read, m.has_attachments,
	f.name, f.role, m.body, m.body_html, m.body_synced > 0`

func MailExportBatch(conn *sql.DB, ownerID int64, folders []string, after *MailCursor, limit int) ([]MailExportRow, error) {
	query := strings.Builder{}
	query.WriteString("SELECT " + mailExportColumns + ` FROM mail_messages m
		JOIN mail_folders f ON f.owner_id = m.owner_id AND f.id = m.folder
		WHERE m.owner_id = ?`)
	args := []any{ownerID}

	if len(folders) > 0 {
		query.WriteString(" AND (f.id IN (" + placeholders(len(folders)) + ") OR f.role IN (" + placeholders(len(folders)) + "))")
		for range 2 {
			for _, folder := range folders {
				args = append(args, folder)
			}
		}
	}
	if after != nil {
		query.WriteString(" AND (m.received, m.id) > (?, ?)")
		args = append(args, after.Received, after.ID)
	}
	query.WriteString(" ORDER BY m.received, m.id LIMIT ?")
	args = append(args, limit)

	rows, err := conn.Query(query.String(), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	batch := []MailExportRow{}
	for rows.Next() {
		var r MailExportRow
		var to, cc string
		err := rows.Scan(&r.ID, &r.OwnerID, &r.EWSID, &r.Folder, &r.ConversationID, &r.Subject,
			&r.SenderName, &r.SenderEmail, &to, &cc, &r.Received, &r.IsRead, &r.HasAttachments,
			&r.FolderName, &r.FolderRole, &r.Body, &r.BodyHTML, &r.BodyLoaded)
		if err != nil {
			return nil, err
		}
		if err := decodeRecipients(&r.MailMessage, to, cc); err != nil {
			return nil, err
		}
		batch = append(batch, r)
	}

	return batch, rows.Err()
}

func MailRecipientsFor(conn *sql.DB, ownerID int64, messageIDs []string) (map[string][]MailRecipient, error) {
	result := map[string][]MailRecipient{}
	if len(messageIDs) == 0 {
		return result, nil
	}

	args := []any{ownerID}
	for _, id := range messageIDs {
		args = append(args, id)
	}

	rows, err := conn.Query(`
		SELECT message_id, kind, name, email FROM mail_recipients
		WHERE owner_id = ? AND message_id IN (`+placeholders(len(messageIDs))+`)
		ORDER BY message_id, position`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var id string
		var r MailRecipient
		if err := rows.Scan(&id, &r.Kind, &r.Name, &r.Email); err != nil {
			return nil, err
		}
		result[id] = append(result[id], r)
	}

	return result, rows.Err()
}

func MailAttachmentsFor(conn *sql.DB, ownerID int64, messageIDs []string) (map[string][]MailAttachment, error) {
	result := map[string][]MailAttachment{}
	if len(messageIDs) == 0 {
		return result, nil
	}

	args := []any{ownerID}
	for _, id := range messageIDs {
		args = append(args, id)
	}

	attachments, err := mailAttachments(conn, "WHERE owner_id = ? AND message_id IN ("+placeholders(len(messageIDs))+") ORDER BY message_id, position", args...)
	if err != nil {
		return nil, err
	}
	for _, a := range attachments {
		result[a.MessageID] = append(result[a.MessageID], a)
	}

	return result, nil
}
