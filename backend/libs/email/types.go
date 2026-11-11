package email

import (
	"encoding/base64"
	"time"
)

func EncodeItemID(rawID string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(rawID))
}

func DecodeItemID(encoded string) (string, error) {
	b, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

type EmailSummary struct {
	UID            uint32     `json:"uid"`
	EWSID          string     `json:"ewsid"`
	Subject        string     `json:"subject"`
	SenderName     string     `json:"sender_name"`
	SenderEmail    string     `json:"sender_email"`
	ToRecipients   []string   `json:"to_recipients,omitempty"`
	ToContacts     []Contact  `json:"to_contacts,omitempty"`
	CcContacts     []Contact  `json:"cc_contacts,omitempty"`
	CcRecipients   []string   `json:"cc_recipients,omitempty"`
	Received       time.Time  `json:"received"`
	IsRead         bool       `json:"is_read"`
	HasAttachments bool       `json:"has_attachments"`
	IsFlagged      bool       `json:"is_flagged"`
	Categories     []string   `json:"categories,omitempty"`
	ConversationID string     `json:"conversation_id,omitempty"`
	IsArchived     bool       `json:"is_archived,omitempty"`
	SnoozedUntil   *time.Time `json:"snoozed_until,omitempty"`
	Labels         []string   `json:"labels,omitempty"`
}

type Attachment struct {
	EWSID       string `json:"ewsid"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	Size        int    `json:"size"`
	ContentID   string `json:"content_id,omitempty"`
	IsInline    bool   `json:"is_inline,omitempty"`
}

type AttachmentContent struct {
	Filename    string
	ContentType string
	Data        []byte
}

type EmailDetail struct {
	EmailSummary
	Body                   string       `json:"body"`
	BodyHTML               string       `json:"body_html"`
	Attachments            []Attachment `json:"attachments"`
	UnsubscribeURL         string       `json:"unsubscribe_url,omitempty"`
	IsReadReceiptRequested bool         `json:"read_receipt_requested,omitempty"`
}

type InboxResult struct {
	Emails      []EmailSummary `json:"emails"`
	Total       int            `json:"total"`
	UnreadCount int            `json:"unread_count"`
}

type TestResult struct {
	Success     bool   `json:"success"`
	Email       string `json:"email"`
	InboxCount  int    `json:"inbox_count"`
	UnreadCount int    `json:"unread_count"`
}

type Contact struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}
