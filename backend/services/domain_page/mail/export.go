package mail

import (
	"encoding/json"
	"errors"
	"io"
	"regexp"
	"strings"
	"time"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

type ExportOptions struct {
	Format  string
	Folders []string
	HTML    bool
}

type ExportPerson struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

type ExportAttachment struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
	Inline      bool   `json:"inline"`
}

type ExportMail struct {
	ID             string             `json:"id"`
	ConversationID string             `json:"conversation_id"`
	Folder         string             `json:"folder"`
	FolderRole     string             `json:"folder_role"`
	Direction      string             `json:"direction"`
	Date           string             `json:"date"`
	Subject        string             `json:"subject"`
	From           ExportPerson       `json:"from"`
	To             []ExportPerson     `json:"to"`
	Cc             []ExportPerson     `json:"cc"`
	IsRead         bool               `json:"is_read"`
	Text           string             `json:"text"`
	HTML           string             `json:"html,omitempty"`
	BodyLoaded     bool               `json:"body_loaded"`
	Attachments    []ExportAttachment `json:"attachments"`
}

const (
	FormatJSON     = "json"
	FormatJSONL    = "jsonl"
	exportBatch    = 100
	exportVersion  = 1
	directionSent  = "sent"
	directionIn    = "received"
	directionDraft = "draft"
	maxFolderArgs  = 50
)

var ErrInvalidExport = errors.New("invalid export options")

var (
	blankRuns = regexp.MustCompile(`[ \t\f\v\x{00a0}]+`)
	lineRuns  = regexp.MustCompile(`\n{3,}`)
)

var skippedTags = map[atom.Atom]bool{atom.Script: true, atom.Style: true, atom.Head: true, atom.Title: true, atom.Noscript: true, atom.Template: true}

var blockTags = map[atom.Atom]bool{
	atom.P: true, atom.Div: true, atom.Tr: true, atom.Table: true, atom.Blockquote: true, atom.Section: true,
	atom.Article: true, atom.Header: true, atom.Footer: true, atom.Ul: true, atom.Ol: true, atom.Pre: true,
	atom.H1: true, atom.H2: true, atom.H3: true, atom.H4: true, atom.H5: true, atom.H6: true, atom.Hr: true,
}

func ExportFilename(format string) string {
	return "mails-" + time.Now().Format("2006-01-02") + "." + format
}

func ValidateExport(opts ExportOptions) error {
	if opts.Format != FormatJSON && opts.Format != FormatJSONL {
		return ErrInvalidExport
	}
	if len(opts.Folders) > maxFolderArgs {
		return ErrInvalidExport
	}

	return nil
}

func Export(userID int64, opts ExportOptions, w io.Writer) error {
	if err := ValidateExport(opts); err != nil {
		return err
	}

	if opts.Format == FormatJSON {
		header, err := json.Marshal(map[string]any{"exported_at": time.Now().UTC().Format(time.RFC3339), "format_version": exportVersion})
		if err != nil {
			return err
		}
		if _, err := io.WriteString(w, strings.TrimSuffix(string(header), "}")+`,"messages":[`); err != nil {
			return err
		}
	}

	var cursor *store.MailCursor
	first := true
	for {
		batch, err := store.MailExportBatch(db.DB, userID, opts.Folders, cursor, exportBatch)
		if err != nil {
			return err
		}
		if len(batch) == 0 {
			break
		}

		ids := make([]string, len(batch))
		for i, row := range batch {
			ids[i] = row.ID
		}
		recipients, err := store.MailRecipientsFor(db.DB, userID, ids)
		if err != nil {
			return err
		}
		attachments, err := store.MailAttachmentsFor(db.DB, userID, ids)
		if err != nil {
			return err
		}

		for i := range batch {
			record, err := marshalRecord(exportMail(&batch[i], recipients[batch[i].ID], attachments[batch[i].ID], opts.HTML))
			if err != nil {
				return err
			}

			separator := ""
			switch {
			case opts.Format == FormatJSONL:
				record = append(record, '\n')
			case !first:
				separator = ","
			}
			if _, err := io.WriteString(w, separator); err != nil {
				return err
			}
			if _, err := w.Write(record); err != nil {
				return err
			}
			first = false
		}

		last := batch[len(batch)-1]
		cursor = &store.MailCursor{Received: last.Received, ID: last.ID}
		if len(batch) < exportBatch {
			break
		}
	}

	if opts.Format == FormatJSON {
		_, err := io.WriteString(w, "]}\n")
		return err
	}

	return nil
}

func marshalRecord(m ExportMail) ([]byte, error) {
	var buf strings.Builder
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(m); err != nil {
		return nil, err
	}

	return []byte(strings.TrimSuffix(buf.String(), "\n")), nil
}

func exportMail(row *store.MailExportRow, recipients []store.MailRecipient, attachments []store.MailAttachment, includeHTML bool) ExportMail {
	m := ExportMail{
		ID:             row.ID,
		ConversationID: row.ConversationID,
		Folder:         row.FolderName,
		FolderRole:     row.FolderRole,
		Direction:      direction(row.FolderRole),
		Date:           row.Received,
		Subject:        row.Subject,
		From:           ExportPerson{Name: row.SenderName, Email: strings.ToLower(row.SenderEmail)},
		To:             []ExportPerson{},
		Cc:             []ExportPerson{},
		IsRead:         row.IsRead,
		BodyLoaded:     row.BodyLoaded,
		Attachments:    []ExportAttachment{},
	}

	if len(recipients) > 0 {
		for _, r := range recipients {
			person := ExportPerson{Name: r.Name, Email: strings.ToLower(r.Email)}
			if r.Kind == recipientCc {
				m.Cc = append(m.Cc, person)
			} else {
				m.To = append(m.To, person)
			}
		}
	} else {
		for _, address := range row.To {
			m.To = append(m.To, ExportPerson{Email: strings.ToLower(address)})
		}
		for _, address := range row.Cc {
			m.Cc = append(m.Cc, ExportPerson{Email: strings.ToLower(address)})
		}
	}

	m.Text = strings.TrimSpace(row.Body)
	if m.Text == "" && row.BodyHTML != "" {
		m.Text = htmlText(row.BodyHTML)
	}
	if includeHTML {
		m.HTML = row.BodyHTML
	}

	for _, a := range attachments {
		m.Attachments = append(m.Attachments, ExportAttachment{Filename: a.Filename, ContentType: a.ContentType, Size: a.Size, Inline: a.IsInline})
	}

	return m
}

func direction(role string) string {
	switch role {
	case sentRole, outboxRole:
		return directionSent
	case draftsRole:
		return directionDraft
	default:
		return directionIn
	}
}

func htmlText(source string) string {
	tokenizer := html.NewTokenizer(strings.NewReader(source))
	var out strings.Builder
	skipping := 0

	for {
		switch tokenizer.Next() {
		case html.ErrorToken:
			return tidy(out.String())
		case html.StartTagToken, html.SelfClosingTagToken:
			name, _ := tokenizer.TagName()
			tag := atom.Lookup(name)
			switch {
			case skippedTags[tag]:
				skipping++
			case tag == atom.Br:
				out.WriteString("\n")
			case tag == atom.Li:
				out.WriteString("\n- ")
			case tag == atom.Td || tag == atom.Th:
				out.WriteString(" ")
			case blockTags[tag]:
				out.WriteString("\n")
			}
		case html.EndTagToken:
			name, _ := tokenizer.TagName()
			tag := atom.Lookup(name)
			switch {
			case skippedTags[tag]:
				if skipping > 0 {
					skipping--
				}
			case blockTags[tag]:
				out.WriteString("\n")
			}
		case html.TextToken:
			if skipping == 0 {
				out.Write(tokenizer.Text())
			}
		}
	}
}

func tidy(text string) string {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	for i, line := range lines {
		lines[i] = strings.TrimSpace(blankRuns.ReplaceAllString(line, " "))
	}

	return strings.TrimSpace(lineRuns.ReplaceAllString(strings.Join(lines, "\n"), "\n\n"))
}
