package mail

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"path"
	"slices"
	"time"

	"home-v4/backend/services/connections"
	"home-v4/backend/services/db"
	"home-v4/backend/services/storage"
	store "home-v4/backend/store/domain_page"
	"home-v4/libs/email"
)

//go:embed schema.sql
var Schema string

type Message = store.MailMessage

type Detail = store.MailDetail

type Attachment = store.MailAttachment

type Folder = store.MailFolder

var roleOrder = []string{"inbox", "drafts", "sentitems", "deleteditems", "junkemail", "outbox"}

var (
	ErrNotFound      = errors.New("mail item not found")
	ErrUnknownFolder = errors.New("unknown mail folder")
	ErrUnavailable   = errors.New("mail attachment unavailable")
)

const (
	area         = "mail"
	draftsRole   = "drafts"
	recipientTo  = "to"
	recipientCc  = "cc"
	pageSize     = 100
	bodyChunk    = 40
	keyBytes     = 16
	DefaultLimit = 50
	MaxLimit     = 200
)

func Folders(userID int64) ([]Folder, error) {
	return store.MailFolders(db.DB, userID)
}

type Filter = store.MailFilter

func Messages(userID int64, ref string, filter Filter, limit, offset int) ([]Message, int, error) {
	folder, err := store.MailFolderByRef(db.DB, userID, ref)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, 0, ErrUnknownFolder
	}
	if err != nil {
		return nil, 0, err
	}
	if limit <= 0 || limit > MaxLimit {
		limit = DefaultLimit
	}
	if offset < 0 {
		offset = 0
	}

	return store.MailMessages(db.DB, userID, folder.ID, filter, limit, offset)
}

func SetRead(userID int64, id string, read bool) error {
	detail, err := store.MailDetailByID(db.DB, userID, id)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if detail.IsRead == read {
		return nil
	}

	raw, err := email.DecodeItemID(detail.EWSID)
	if err != nil {
		return ErrNotFound
	}

	creds, err := connections.Login(userID, connections.Mail)
	if err != nil {
		return err
	}

	if read {
		err = email.MarkReadByID(connections.MailServer, creds.Username, creds.Password, raw)
	} else {
		err = email.MarkUnreadByID(connections.MailServer, creds.Username, creds.Password, raw)
	}
	if err != nil {
		return err
	}

	return store.SetMailRead(db.DB, userID, id, read)
}

func MessageByID(userID int64, id string) (*Detail, error) {
	detail, err := store.MailDetailByID(db.DB, userID, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil || detail.BodyLoaded {
		return detail, err
	}

	creds, err := connections.Login(userID, connections.Mail)
	if err == nil {
		err = syncBodies(userID, creds, []Message{detail.MailMessage})
	}
	if err != nil {
		slog.Warn("mail: loading body failed", "message", id, "err", err)
		return detail, nil
	}

	return store.MailDetailByID(db.DB, userID, id)
}

func AttachmentByID(userID int64, id string) (*Attachment, error) {
	attachment, err := store.MailAttachmentByID(db.DB, userID, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil || attachment.Path != nil {
		return attachment, err
	}

	creds, err := connections.Login(userID, connections.Mail)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrUnavailable, err)
	}
	if err := saveAttachment(userID, creds, attachment); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrUnavailable, err)
	}

	return attachment, nil
}

func Sync(userID int64) error {
	creds, err := connections.Login(userID, connections.Mail)
	if err != nil {
		return err
	}

	remote, err := email.GetFolders(connections.MailServer, creds.Username, creds.Password)
	if err != nil {
		return err
	}

	folders := folderList(remote)
	if err := store.ReplaceMailFolders(db.DB, userID, folders, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		return err
	}

	for _, folder := range folders {
		if err := syncFolder(userID, creds, folder); err != nil {
			return err
		}
	}

	if err := rebuildContacts(userID); err != nil {
		return err
	}

	pending, err := store.MailPendingAttachments(db.DB, userID)
	if err != nil {
		return err
	}
	for i := range pending {
		if err := saveAttachment(userID, creds, &pending[i]); err != nil {
			if errors.Is(err, email.ErrAuthFailed) {
				return err
			}
			slog.Warn("mail: attachment download failed", "file", pending[i].Filename, "err", err)
		}
	}

	keep, err := store.MailAttachmentPaths(db.DB, userID)
	if err != nil {
		return err
	}

	return storage.Prune(storage.UserDir(userID, area), keep)
}

func folderList(remote []email.Folder) []Folder {
	keys := make(map[string]string, len(remote))
	for _, f := range remote {
		keys[f.ID] = key(f.ID)
	}

	ordered := slices.Clone(remote)
	slices.SortStableFunc(ordered, func(a, b email.Folder) int {
		return roleRank(a.Role) - roleRank(b.Role)
	})

	folders := make([]Folder, 0, len(ordered))
	for position, f := range ordered {
		folder := Folder{ID: keys[f.ID], EWSID: f.ID, Name: f.Name, Role: f.Role, Position: position}
		if parent, ok := keys[f.ParentID]; ok {
			folder.ParentID = &parent
		}
		folders = append(folders, folder)
	}

	return folders
}

func roleRank(role string) int {
	if i := slices.Index(roleOrder, role); i >= 0 {
		return i
	}

	return len(roleOrder)
}

func syncFolder(userID int64, creds *connections.Credentials, folder Folder) error {
	syncedAt := time.Now().UTC().Format(time.RFC3339Nano)

	var summaries []Message
	for offset := 0; ; offset += pageSize {
		page, err := email.GetMessagesInFolder(connections.MailServer, creds.Username, creds.Password, folder.EWSID, pageSize, offset)
		if err != nil {
			return err
		}

		for _, e := range page {
			summaries = append(summaries, Message{
				ID:             key(e.EWSID),
				EWSID:          e.EWSID,
				Folder:         folder.ID,
				ConversationID: e.ConversationID,
				Subject:        e.Subject,
				SenderName:     e.SenderName,
				SenderEmail:    e.SenderEmail,
				To:             e.ToRecipients,
				Received:       e.Received.UTC().Format(time.RFC3339),
				IsRead:         e.IsRead,
				HasAttachments: e.HasAttachments,
			})
		}

		if len(page) < pageSize {
			break
		}
	}

	if err := store.UpsertMailSummaries(db.DB, userID, summaries, syncedAt); err != nil {
		return err
	}
	if err := store.DeleteStaleMail(db.DB, userID, folder.ID, syncedAt); err != nil {
		return err
	}

	pending, err := store.MailPendingBodies(db.DB, userID, folder.ID, folder.Role == draftsRole)
	if err != nil {
		return err
	}

	return syncBodies(userID, creds, pending)
}

func syncBodies(userID int64, creds *connections.Credentials, pending []Message) error {
	for chunk := range slices.Chunk(pending, bodyChunk) {
		rawIDs := make([]string, 0, len(chunk))
		for _, m := range chunk {
			raw, err := email.DecodeItemID(m.EWSID)
			if err != nil {
				continue
			}
			rawIDs = append(rawIDs, raw)
		}

		result := email.GetEmailsByIDs(connections.MailServer, creds.Username, creds.Password, rawIDs)
		for _, failure := range result.Errors {
			if errors.Is(failure.Err, email.ErrAuthFailed) {
				return failure.Err
			}
		}

		bodies := make([]store.MailBody, 0, len(chunk))
		for _, m := range chunk {
			detail, ok := result.Succeeded[m.EWSID]
			if !ok {
				continue
			}
			bodies = append(bodies, body(m.ID, detail))
		}

		if err := store.StoreMailBodies(db.DB, userID, bodies); err != nil {
			return err
		}
	}

	return nil
}

func body(messageID string, detail *email.EmailDetail) store.MailBody {
	b := store.MailBody{
		MessageID:      messageID,
		To:             detail.ToRecipients,
		Cc:             detail.CcRecipients,
		Body:           detail.Body,
		BodyHTML:       detail.BodyHTML,
		UnsubscribeURL: detail.UnsubscribeURL,
	}

	for _, c := range detail.ToContacts {
		b.Recipients = append(b.Recipients, store.MailRecipient{Kind: recipientTo, Name: c.Name, Email: c.Email})
	}
	for _, c := range detail.CcContacts {
		b.Recipients = append(b.Recipients, store.MailRecipient{Kind: recipientCc, Name: c.Name, Email: c.Email})
	}

	for position, a := range detail.Attachments {
		attachment := Attachment{
			ID:          key(a.EWSID),
			EWSID:       a.EWSID,
			MessageID:   messageID,
			Filename:    a.Filename,
			ContentType: a.ContentType,
			Size:        int64(a.Size),
			ContentID:   a.ContentID,
			IsInline:    a.IsInline,
			Position:    position,
		}

		b.Attachments = append(b.Attachments, attachment)
	}

	return b
}

func saveAttachment(userID int64, creds *connections.Credentials, attachment *Attachment) error {
	name := path.Join(storage.UserDir(userID, area), attachment.ID)
	if err := fetchAttachment(creds, attachment.EWSID, name); err != nil {
		return err
	}
	if err := store.SetMailAttachmentPath(db.DB, userID, attachment.ID, name); err != nil {
		return err
	}

	attachment.Path = &name
	return nil
}

func fetchAttachment(creds *connections.Credentials, encodedID, name string) error {
	raw, err := email.DecodeItemID(encodedID)
	if err != nil {
		return err
	}

	content, err := email.GetAttachment(connections.MailServer, creds.Username, creds.Password, raw)
	if err != nil {
		return err
	}

	return storage.Write(name, bytes.NewReader(content.Data))
}

func key(ewsID string) string {
	sum := sha256.Sum256([]byte(ewsID))
	return hex.EncodeToString(sum[:keyBytes])
}
