package email

import (
	"crypto/tls"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/Azure/go-ntlmssp"
)

var ErrAuthFailed = errors.New("EWS authentication failed")

const certRetries = 3

var certRetryDelay = 2 * time.Second

type ewsClient struct {
	endpoint string
	client   *http.Client
}

func newEWSClient(server, username, password string) *ewsClient {
	endpoint := ewsEndpoint(server)
	transport := ntlmssp.Negotiator{
		RoundTripper: &http.Transport{},
	}
	client := &http.Client{
		Timeout: 30 * time.Second,
		Transport: &ntlmAuthTransport{
			base:     transport,
			username: username,
			password: password,
		},
	}
	return &ewsClient{endpoint: endpoint, client: client}
}

type ntlmAuthTransport struct {
	base     ntlmssp.Negotiator
	username string
	password string
}

func (t *ntlmAuthTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	req.SetBasicAuth(t.username, t.password)
	return t.base.RoundTrip(req)
}

func ewsEndpoint(server string) string {
	server = strings.TrimRight(server, "/")
	if strings.HasPrefix(server, "http") {
		return server + "/EWS/Exchange.asmx"
	}
	return "https://" + server + "/EWS/Exchange.asmx"
}

func ewsFolderID(folder string) string {
	switch strings.ToLower(folder) {
	case "sent", "sentitems":
		return "sentitems"
	case "drafts":
		return "drafts"
	case "deleted", "deleteditems", "trash":
		return "deleteditems"
	case "junk", "spam", "junkemail":
		return "junkemail"
	default:
		return "inbox"
	}
}

func buildMailboxList(addrs []string) string {
	var b strings.Builder
	for _, addr := range addrs {
		b.WriteString(fmt.Sprintf(`<t:Mailbox><t:EmailAddress>%s</t:EmailAddress></t:Mailbox>`, xmlEscape(addr)))
	}
	return b.String()
}

func (c *ewsClient) do(soapBody, operation string) ([]byte, error) {
	envelope := `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
               xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">
  <soap:Header>
    <t:RequestServerVersion Version="Exchange2010_SP2"/>
  </soap:Header>
  <soap:Body>` + soapBody + `</soap:Body>
</soap:Envelope>`

	slog.Debug("ews: sending request", "endpoint", c.endpoint)

	resp, err := c.send(envelope, operation)
	if err != nil {
		slog.Error("ews: HTTP request failed", "endpoint", c.endpoint, "err", err)
		return nil, fmt.Errorf("EWS request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read EWS response: %w", err)
	}

	slog.Debug("ews: response received", "status", resp.StatusCode, "bytes", len(body))

	if resp.StatusCode == 401 {
		slog.Warn("ews: authentication failed (401)", "endpoint", c.endpoint)
		return nil, fmt.Errorf("authentication failed (NTLM): %w", ErrAuthFailed)
	}
	if resp.StatusCode != 200 {
		preview := string(body)
		if len(preview) > 4000 {
			preview = preview[:4000]
		}
		slog.Warn("ews: unexpected HTTP status", "status", resp.StatusCode, "body_preview", preview)
		return nil, fmt.Errorf("EWS returned HTTP %d", resp.StatusCode)
	}
	return body, nil
}

func (c *ewsClient) send(envelope, operation string) (*http.Response, error) {
	for attempt := 0; ; attempt++ {
		req, err := http.NewRequest("POST", c.endpoint, strings.NewReader(envelope))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "text/xml; charset=utf-8")
		req.Header.Set("SOAPAction", `"http://schemas.microsoft.com/exchange/services/2006/messages/`+operation+`"`)

		resp, err := c.client.Do(req)

		var certErr *tls.CertificateVerificationError
		if err == nil || attempt >= certRetries || !errors.As(err, &certErr) {
			return resp, err
		}

		issuer := ""
		if len(certErr.UnverifiedCertificates) > 0 {
			issuer = certErr.UnverifiedCertificates[0].Issuer.CommonName
		}
		slog.Warn("ews: rejected untrusted certificate, retrying", "endpoint", c.endpoint, "issuer", issuer, "attempt", attempt+1)
		time.Sleep(time.Duration(attempt+1) * certRetryDelay)
	}
}

type ewsEnvelope struct {
	Body ewsBody `xml:"Body"`
}

type ewsBody struct {
	FindItemResponse         *findItemResponse         `xml:"FindItemResponse"`
	GetItemResponse          *getItemResponse          `xml:"GetItemResponse"`
	GetFolderResponse        *getFolderResponse        `xml:"GetFolderResponse"`
	UpdateItemResponse       *updateItemResponse       `xml:"UpdateItemResponse"`
	DeleteItemResponse       *deleteItemResponse       `xml:"DeleteItemResponse"`
	CreateItemResponse       *createItemResponse       `xml:"CreateItemResponse"`
	GetAttachmentResponse    *getAttachmentResponse    `xml:"GetAttachmentResponse"`
	MoveItemResponse         *moveItemResponse         `xml:"MoveItemResponse"`
	CreateAttachmentResponse *createAttachmentResponse `xml:"CreateAttachmentResponse"`
	SendItemResponse         *sendItemResponse         `xml:"SendItemResponse"`
}

type findItemResponse struct {
	Messages []findItemResponseMessage `xml:"ResponseMessages>FindItemResponseMessage"`
}

type findItemResponseMessage struct {
	ResponseClass string     `xml:"ResponseClass,attr"`
	MessageText   string     `xml:"MessageText"`
	RootFolder    rootFolder `xml:"RootFolder"`
}

type rootFolder struct {
	TotalItemsInView int        `xml:"TotalItemsInView,attr"`
	ItemSet          ewsItemSet `xml:"Items"`
}

type ewsItemSet struct {
	Items []ewsItem `xml:",any"`
}

type ewsConversationID struct {
	ID string `xml:"Id,attr"`
}

type ewsItem struct {
	ItemID         ewsItemID         `xml:"ItemId"`
	ConversationID ewsConversationID `xml:"ConversationId"`
	Subject        string            `xml:"Subject"`
	From           ewsMailbox        `xml:"From>Mailbox"`
	ToRecipients   []ewsMailbox      `xml:"ToRecipients>Mailbox"`
	CcRecipients   []ewsMailbox      `xml:"CcRecipients>Mailbox"`
	DateTimeSent   string            `xml:"DateTimeSent"`
	IsRead         bool              `xml:"IsRead"`
	HasAttachments bool              `xml:"HasAttachments"`
}

type ewsItemID struct {
	ID        string `xml:"Id,attr"`
	ChangeKey string `xml:"ChangeKey,attr"`
}

type ewsMailbox struct {
	Name         string `xml:"Name"`
	EmailAddress string `xml:"EmailAddress"`
}

type getFolderResponse struct {
	Messages []getFolderResponseMessage `xml:"ResponseMessages>GetFolderResponseMessage"`
}

type getFolderResponseMessage struct {
	Folders []ewsFolder `xml:"Folders>Folder"`
}

type ewsFolder struct {
	TotalCount  int `xml:"TotalCount"`
	UnreadCount int `xml:"UnreadCount"`
}

type getItemResponse struct {
	Messages []getItemResponseMessage `xml:"ResponseMessages>GetItemResponseMessage"`
}

type getItemResponseMessage struct {
	ResponseClass string         `xml:"ResponseClass,attr"`
	MessageText   string         `xml:"MessageText"`
	ItemSet       ewsFullItemSet `xml:"Items"`
}

type ewsFullItemSet struct {
	Items []ewsFullItem `xml:",any"`
}

type ewsFullItem struct {
	ewsItem
	Body                   ewsBodyContent `xml:"Body"`
	MIMEContent            string         `xml:"MimeContent"`
	Attachments            []ewsAttach    `xml:"Attachments>FileAttachment"`
	IsReadReceiptRequested bool           `xml:"IsReadReceiptRequested"`
}

type ewsBodyContent struct {
	BodyType string `xml:"BodyType,attr"`
	Content  string `xml:",chardata"`
}

type ewsAttach struct {
	AttachmentID ewsAttachID `xml:"AttachmentId"`
	Name         string      `xml:"Name"`
	ContentType  string      `xml:"ContentType"`
	Size         int         `xml:"Size"`
	ContentID    string      `xml:"ContentId"`
	IsInline     bool        `xml:"IsInline"`
}

type ewsAttachID struct {
	ID string `xml:"Id,attr"`
}

type createItemResponse struct {
	Messages []createItemResponseMessage `xml:"ResponseMessages>CreateItemResponseMessage"`
}

type createItemResponseMessage struct {
	ResponseClass string          `xml:"ResponseClass,attr"`
	MessageText   string          `xml:"MessageText"`
	Items         []ewsCreatedMsg `xml:"Items>Message"`
}

type ewsCreatedMsg struct {
	ItemID ewsItemID `xml:"ItemId"`
}

type updateItemResponse struct {
	Messages []updateItemMsg `xml:"ResponseMessages>UpdateItemResponseMessage"`
}
type updateItemMsg struct {
	ResponseClass string       `xml:"ResponseClass,attr"`
	MessageText   string       `xml:"MessageText"`
	Items         []ewsItemRef `xml:"Items>Message"`
}
type ewsItemRef struct {
	ItemID ewsItemID `xml:"ItemId"`
}
type deleteItemResponse struct{}

func GetFolderUnreadCount(server, username, password, folder string) (int, error) {
	c := newEWSClient(server, username, password)
	_, unread, err := c.folderStats(ewsFolderID(folder))
	return unread, err
}

func TestConnection(server, username, password string) (*TestResult, error) {
	slog.Debug("ews: testing connection", "server", server, "user", username)
	c := newEWSClient(server, username, password)

	total, unread, err := c.folderStats("inbox")
	if err != nil {
		slog.Warn("ews: connection test failed", "server", server, "user", username, "err", err)
		return nil, err
	}
	slog.Info("ews: connection ok", "server", server, "user", username, "total", total, "unread", unread)
	return &TestResult{
		Success:     true,
		Email:       username,
		InboxCount:  total,
		UnreadCount: unread,
	}, nil
}

func GetMessages(server, username, password, folder string, limit, offset int) (*InboxResult, error) {
	folderEWS := ewsFolderID(folder)
	slog.Debug("ews: GetMessages", "server", server, "user", username, "folder", folderEWS, "limit", limit, "offset", offset)
	c := newEWSClient(server, username, password)

	total, unread, err := c.folderStats(folderEWS)
	if err != nil {
		slog.Warn("ews: GetMessages folderStats failed", "folder", folderEWS, "err", err)
		return nil, err
	}

	items, err := c.findItems(folderEWS, limit, offset)
	if err != nil {
		slog.Warn("ews: GetMessages findItems failed", "folder", folderEWS, "err", err)
		return nil, err
	}

	emails := make([]EmailSummary, 0, len(items))
	for _, item := range items {
		emails = append(emails, summaryFromEWS(item))
	}
	return &InboxResult{Emails: emails, Total: total, UnreadCount: unread}, nil
}

func GetEmailByID(server, username, password, itemID string) (*EmailDetail, error) {
	c := newEWSClient(server, username, password)
	return c.getItem(itemID)
}

func MarkReadByID(server, username, password, itemID string) error {
	c := newEWSClient(server, username, password)
	return c.markRead(itemID)
}

func DeleteEmailByID(server, username, password, itemID string) error {
	c := newEWSClient(server, username, password)
	return c.deleteItem(itemID)
}

func DeleteEmailPermanent(server, username, password, itemID string) error {
	c := newEWSClient(server, username, password)
	return c.deleteItemHard(itemID)
}

func SendEmail(server, username, password string, to, cc, bcc []string, subject, body string, html bool) error {
	slog.Debug("ews: SendEmail", "server", server, "user", username, "to", to, "subject", subject)
	c := newEWSClient(server, username, password)
	return c.sendNewEmail(to, cc, bcc, subject, body, bodyTypeStr(html))
}

func ReplyEmail(server, username, password, itemID, body string, html, all bool) error {
	slog.Debug("ews: ReplyEmail", "server", server, "user", username, "all", all)
	c := newEWSClient(server, username, password)
	return c.replyItem(itemID, body, bodyTypeStr(html), all)
}

func ForwardEmail(server, username, password, itemID string, to []string, body string, html bool) error {
	slog.Debug("ews: ForwardEmail", "server", server, "user", username, "to", to)
	c := newEWSClient(server, username, password)
	return c.forwardItem(itemID, to, body, bodyTypeStr(html))
}

func (c *ewsClient) folderStats(folderEWS string) (total, unread int, err error) {
	body, err := c.do(fmt.Sprintf(`
<m:GetFolder>
  <m:FolderShape>
    <t:BaseShape>AllProperties</t:BaseShape>
  </m:FolderShape>
  <m:FolderIds>
    <t:DistinguishedFolderId Id="%s"/>
  </m:FolderIds>
</m:GetFolder>`, folderEWS), "GetFolder")
	if err != nil {
		return 0, 0, err
	}

	var env ewsEnvelope
	if err := xml.Unmarshal(body, &env); err != nil {
		slog.Error("ews: GetFolder XML parse failed", "err", err, "body_preview", truncate(string(body), 300))
		return 0, 0, fmt.Errorf("parse GetFolder response: %w", err)
	}
	if env.Body.GetFolderResponse == nil || len(env.Body.GetFolderResponse.Messages) == 0 {
		return 0, 0, fmt.Errorf("empty GetFolder response")
	}
	msgs := env.Body.GetFolderResponse.Messages[0]
	if len(msgs.Folders) == 0 {
		return 0, 0, nil
	}
	f := msgs.Folders[0]
	return f.TotalCount, f.UnreadCount, nil
}

func (c *ewsClient) findItems(folderEWS string, limit, offset int) ([]ewsItem, error) {
	return c.findItemsUnder(fmt.Sprintf(`<t:DistinguishedFolderId Id="%s"/>`, folderEWS), limit, offset)
}

func (c *ewsClient) findItemsUnder(parent string, limit, offset int) ([]ewsItem, error) {
	body, err := c.do(fmt.Sprintf(`
<m:FindItem Traversal="Shallow">
  <m:ItemShape>
    <t:BaseShape>IdOnly</t:BaseShape>
    <t:AdditionalProperties>
      <t:FieldURI FieldURI="item:Subject"/>
      <t:FieldURI FieldURI="item:DateTimeSent"/>
      <t:FieldURI FieldURI="message:IsRead"/>
      <t:FieldURI FieldURI="item:HasAttachments"/>
      <t:FieldURI FieldURI="message:From"/>
      <t:FieldURI FieldURI="message:ToRecipients"/>
      <t:FieldURI FieldURI="item:ConversationId"/>
    </t:AdditionalProperties>
  </m:ItemShape>
  <m:IndexedPageItemView MaxEntriesReturned="%d" Offset="%d" BasePoint="Beginning"/>
  <m:SortOrder>
    <t:FieldOrder Order="Descending">
      <t:FieldURI FieldURI="item:DateTimeSent"/>
    </t:FieldOrder>
  </m:SortOrder>
  <m:ParentFolderIds>
    %s
  </m:ParentFolderIds>
</m:FindItem>`, limit, offset, parent), "FindItem")
	if err != nil {
		return nil, err
	}

	var env ewsEnvelope
	if err := xml.Unmarshal(body, &env); err != nil {
		return nil, fmt.Errorf("parse FindItem response: %w", err)
	}
	if env.Body.FindItemResponse == nil || len(env.Body.FindItemResponse.Messages) == 0 {
		return nil, nil
	}
	msg := env.Body.FindItemResponse.Messages[0]
	if msg.ResponseClass != "Success" {
		return nil, fmt.Errorf("FindItem failed: %s", msg.MessageText)
	}
	return msg.RootFolder.ItemSet.Items, nil
}

func (c *ewsClient) getFullItem(itemID string) (*ewsFullItem, error) {
	body, err := c.do(fmt.Sprintf(`
<m:GetItem>
  <m:ItemShape>
    <t:BaseShape>AllProperties</t:BaseShape>
    <t:IncludeMimeContent>true</t:IncludeMimeContent>
    <t:BodyType>HTML</t:BodyType>
  </m:ItemShape>
  <m:ItemIds>
    <t:ItemId Id="%s"/>
  </m:ItemIds>
</m:GetItem>`, xmlEscape(itemID)), "GetItem")
	if err != nil {
		return nil, err
	}

	var env ewsEnvelope
	if err := xml.Unmarshal(body, &env); err != nil {
		return nil, fmt.Errorf("parse GetItem response: %w", err)
	}
	if env.Body.GetItemResponse == nil || len(env.Body.GetItemResponse.Messages) == 0 {
		return nil, fmt.Errorf("message not found")
	}
	msg := env.Body.GetItemResponse.Messages[0]
	if msg.ResponseClass != "Success" || len(msg.ItemSet.Items) == 0 {
		return nil, fmt.Errorf("message not found: %s", msg.MessageText)
	}
	item := msg.ItemSet.Items[0]
	return &item, nil
}

func (c *ewsClient) getItem(itemID string) (*EmailDetail, error) {
	item, err := c.getFullItem(itemID)
	if err != nil {
		return nil, err
	}
	return detailFromFullItem(item), nil
}

func detailFromFullItem(item *ewsFullItem) *EmailDetail {
	detail := &EmailDetail{
		EmailSummary:           summaryFromEWS(item.ewsItem),
		Attachments:            []Attachment{},
		IsReadReceiptRequested: item.IsReadReceiptRequested,
	}
	if item.Body.BodyType == "HTML" {
		detail.BodyHTML = sanitizeUTF8(item.Body.Content)
	} else {
		detail.Body = sanitizeUTF8(item.Body.Content)
	}

	if item.MIMEContent != "" && strings.Contains(detail.BodyHTML, "cid:") {
		detail.BodyHTML = sanitizeUTF8(replaceCIDsWithDataURLs(detail.BodyHTML, item.MIMEContent))
	}
	if item.MIMEContent != "" {
		detail.UnsubscribeURL = ParseListUnsubscribe(item.MIMEContent)

		if detail.Body == "" {
			detail.Body = ExtractPlainTextFromMIME(item.MIMEContent)
		}
	}
	for _, a := range item.Attachments {
		detail.Attachments = append(detail.Attachments, Attachment{
			EWSID:       EncodeItemID(a.AttachmentID.ID),
			Filename:    a.Name,
			ContentType: a.ContentType,
			Size:        a.Size,
			ContentID:   a.ContentID,
			IsInline:    a.IsInline,
		})
		detail.HasAttachments = true
	}
	return detail
}

func (c *ewsClient) getFullItemsBatch(rawIDs []string) ([]ewsFullItem, error) {
	if len(rawIDs) == 0 {
		return nil, nil
	}
	var ids strings.Builder
	for _, id := range rawIDs {
		fmt.Fprintf(&ids, `<t:ItemId Id="%s"/>`, xmlEscape(id))
	}
	body, err := c.do(fmt.Sprintf(`
<m:GetItem>
  <m:ItemShape>
    <t:BaseShape>AllProperties</t:BaseShape>
    <t:IncludeMimeContent>true</t:IncludeMimeContent>
    <t:BodyType>HTML</t:BodyType>
  </m:ItemShape>
  <m:ItemIds>%s</m:ItemIds>
</m:GetItem>`, ids.String()), "GetItem")
	if err != nil {
		return nil, err
	}

	var env ewsEnvelope
	if err := xml.Unmarshal(body, &env); err != nil {
		return nil, fmt.Errorf("parse GetItem batch response: %w", err)
	}
	if env.Body.GetItemResponse == nil {
		return nil, fmt.Errorf("empty GetItem batch response")
	}
	out := make([]ewsFullItem, 0, len(rawIDs))
	for _, msg := range env.Body.GetItemResponse.Messages {
		if msg.ResponseClass != "Success" || len(msg.ItemSet.Items) == 0 {
			continue
		}
		out = append(out, msg.ItemSet.Items[0])
	}
	return out, nil
}

type BatchFetchError struct {
	BatchIndex int
	IDs        []string
	Err        error
}

type BatchFetchResult struct {
	Succeeded map[string]*EmailDetail
	FailedIDs []string
	Errors    []BatchFetchError
}

var batchSleep = 250 * time.Millisecond

var batchRetryDelay = 500 * time.Millisecond

type itemFetcher interface {
	getFullItemsBatch(rawIDs []string) ([]ewsFullItem, error)
}

func GetEmailsByIDs(server, username, password string, rawIDs []string) BatchFetchResult {
	res := BatchFetchResult{Succeeded: map[string]*EmailDetail{}}
	if len(rawIDs) == 0 {
		return res
	}
	c := newEWSClient(server, username, password)
	return fetchEmailsByIDs(c, rawIDs, &res)
}

func fetchEmailsByIDs(c itemFetcher, rawIDs []string, res *BatchFetchResult) BatchFetchResult {
	const batchSize = 20
	throttleBackoff := time.Duration(0)
	batchIndex := 0

	for start := 0; start < len(rawIDs); start += batchSize {
		end := start + batchSize
		if end > len(rawIDs) {
			end = len(rawIDs)
		}
		batch := rawIDs[start:end]

		if start > 0 {
			time.Sleep(batchSleep + throttleBackoff)
		}

		items, err := c.getFullItemsBatch(batch)
		if err != nil {
			slog.Warn("mail: body batch error",
				"batch_index", batchIndex,
				"ids_count", len(batch),
				"first_id", firstID(batch),
				"err", err,
			)

			time.Sleep(batchRetryDelay)
			items, err = c.getFullItemsBatch(batch)
			if err != nil {
				slog.Warn("mail: body batch retry failed — splitting",
					"batch_index", batchIndex,
					"ids_count", len(batch),
					"err", err,
				)

				if isThrottleError(err) {
					if throttleBackoff == 0 {
						throttleBackoff = 500 * time.Millisecond
					} else if throttleBackoff < 8*time.Second {
						throttleBackoff *= 2
					}
				}

				for _, id := range batch {
					time.Sleep(batchSleep)
					singleItems, sErr := c.getFullItemsBatch([]string{id})
					if sErr != nil || len(singleItems) == 0 {
						res.FailedIDs = append(res.FailedIDs, id)
						res.Errors = append(res.Errors, BatchFetchError{
							BatchIndex: batchIndex,
							IDs:        []string{id},
							Err:        sErr,
						})
						continue
					}
					d := detailFromFullItem(&singleItems[0])
					res.Succeeded[d.EWSID] = d
				}
				batchIndex++
				continue
			}

			res.Errors = append(res.Errors, BatchFetchError{
				BatchIndex: batchIndex,
				IDs:        append([]string(nil), batch...),
				Err:        nil,
			})
		} else if throttleBackoff > 0 {

			throttleBackoff /= 2
		}

		for i := range items {
			d := detailFromFullItem(&items[i])
			res.Succeeded[d.EWSID] = d
		}
		batchIndex++
	}
	return *res
}

func firstID(batch []string) string {
	if len(batch) == 0 {
		return ""
	}
	id := batch[0]
	if len(id) > 32 {
		return id[:32] + "…"
	}
	return id
}

func isThrottleError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "HTTP 503") ||
		strings.Contains(msg, "ErrorServerBusy") ||
		strings.Contains(msg, "ServerBusy")
}

func (c *ewsClient) markRead(itemID string) error {
	_, err := c.do(fmt.Sprintf(`
<m:UpdateItem MessageDisposition="SaveOnly" ConflictResolution="AlwaysOverwrite">
  <m:ItemChanges>
    <t:ItemChange>
      <t:ItemId Id="%s"/>
      <t:Updates>
        <t:SetItemField>
          <t:FieldURI FieldURI="message:IsRead"/>
          <t:Message><t:IsRead>true</t:IsRead></t:Message>
        </t:SetItemField>
      </t:Updates>
    </t:ItemChange>
  </m:ItemChanges>
</m:UpdateItem>`, xmlEscape(itemID)), "UpdateItem")
	return err
}

func deleteItemXML(itemID, art string) string {
	return fmt.Sprintf(`
<m:DeleteItem DeleteType="%s">
  <m:ItemIds>
    <t:ItemId Id="%s"/>
  </m:ItemIds>
</m:DeleteItem>`, art, xmlEscape(itemID))
}

func (c *ewsClient) deleteItem(itemID string) error {
	_, err := c.do(deleteItemXML(itemID, "MoveToDeletedItems"), "DeleteItem")
	return err
}

func (c *ewsClient) deleteItemHard(itemID string) error {
	_, err := c.do(deleteItemXML(itemID, "HardDelete"), "DeleteItem")
	return err
}

func (c *ewsClient) sendNewEmail(to, cc, bcc []string, subject, body, bodyType string) error {
	ccBlock := ""
	if len(cc) > 0 {
		ccBlock = fmt.Sprintf(`<t:CcRecipients>%s</t:CcRecipients>`, buildMailboxList(cc))
	}
	bccBlock := ""
	if len(bcc) > 0 {
		bccBlock = fmt.Sprintf(`<t:BccRecipients>%s</t:BccRecipients>`, buildMailboxList(bcc))
	}

	resp, err := c.do(fmt.Sprintf(`
<m:CreateItem MessageDisposition="SendAndSaveCopy">
  <m:SavedItemFolderId>
    <t:DistinguishedFolderId Id="sentitems"/>
  </m:SavedItemFolderId>
  <m:Items>
    <t:Message>
      <t:Subject>%s</t:Subject>
      <t:Body BodyType="%s">%s</t:Body>
      <t:ToRecipients>%s</t:ToRecipients>
      %s
      %s
    </t:Message>
  </m:Items>
</m:CreateItem>`, xmlEscape(subject), bodyType, xmlEscape(body), buildMailboxList(to), ccBlock, bccBlock), "CreateItem")
	if err != nil {
		return err
	}
	return checkCreateItemResponse(resp)
}

func (c *ewsClient) replyItem(itemID, body, bodyType string, all bool) error {
	original, err := c.getFullItem(itemID)
	if err != nil {
		return fmt.Errorf("get original for reply: %w", err)
	}

	element := "ReplyToItem"
	if all {
		element = "ReplyAllToItem"
	}

	resp, err := c.do(fmt.Sprintf(`
<m:CreateItem MessageDisposition="SendAndSaveCopy">
  <m:SavedItemFolderId>
    <t:DistinguishedFolderId Id="sentitems"/>
  </m:SavedItemFolderId>
  <m:Items>
    <t:%s>
      <t:ReferenceItemId Id="%s" ChangeKey="%s"/>
      <t:NewBodyContent BodyType="%s">%s</t:NewBodyContent>
    </t:%s>
  </m:Items>
</m:CreateItem>`, element, xmlEscape(original.ItemID.ID), xmlEscape(original.ItemID.ChangeKey), bodyType, xmlEscape(body), element), "CreateItem")
	if err != nil {
		return err
	}
	return checkCreateItemResponse(resp)
}

func (c *ewsClient) forwardItem(itemID string, to []string, body, bodyType string) error {
	original, err := c.getFullItem(itemID)
	if err != nil {
		return fmt.Errorf("get original for forward: %w", err)
	}

	resp, err := c.do(fmt.Sprintf(`
<m:CreateItem MessageDisposition="SendAndSaveCopy">
  <m:SavedItemFolderId>
    <t:DistinguishedFolderId Id="sentitems"/>
  </m:SavedItemFolderId>
  <m:Items>
    <t:ForwardItem>
      <t:ReferenceItemId Id="%s" ChangeKey="%s"/>
      <t:NewBodyContent BodyType="%s">%s</t:NewBodyContent>
      <t:ToRecipients>%s</t:ToRecipients>
    </t:ForwardItem>
  </m:Items>
</m:CreateItem>`, xmlEscape(original.ItemID.ID), xmlEscape(original.ItemID.ChangeKey), bodyType, xmlEscape(body), buildMailboxList(to)), "CreateItem")
	if err != nil {
		return err
	}
	return checkCreateItemResponse(resp)
}

func checkCreateItemResponse(data []byte) error {
	var env ewsEnvelope
	if err := xml.Unmarshal(data, &env); err != nil {
		return fmt.Errorf("parse CreateItem response: %w", err)
	}
	if env.Body.CreateItemResponse == nil {
		return nil
	}
	msgs := env.Body.CreateItemResponse.Messages
	if len(msgs) > 0 && msgs[0].ResponseClass != "Success" {
		return fmt.Errorf("EWS CreateItem failed: %s", msgs[0].MessageText)
	}
	return nil
}

func summaryFromEWS(item ewsItem) EmailSummary {
	s := EmailSummary{
		UID:            0,
		EWSID:          EncodeItemID(item.ItemID.ID),
		Subject:        item.Subject,
		SenderName:     item.From.Name,
		SenderEmail:    item.From.EmailAddress,
		IsRead:         item.IsRead,
		HasAttachments: item.HasAttachments,
		ConversationID: item.ConversationID.ID,
	}
	if s.Subject == "" {
		s.Subject = "(Kein Betreff)"
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05Z", "2006-01-02T15:04:05"} {
		if t, err := time.Parse(layout, item.DateTimeSent); err == nil {
			s.Received = t.UTC()
			break
		}
	}
	s.ToRecipients = adressen(item.ToRecipients)
	s.ToContacts = contacts(item.ToRecipients)
	s.CcRecipients = adressen(item.CcRecipients)
	s.CcContacts = contacts(item.CcRecipients)
	return s
}

func adressen(mbs []ewsMailbox) []string {
	if len(mbs) == 0 {
		return nil
	}
	out := make([]string, 0, len(mbs))
	for _, mb := range mbs {
		if mb.EmailAddress != "" {
			out = append(out, mb.EmailAddress)
		} else if mb.Name != "" {
			out = append(out, mb.Name)
		}
	}
	return out
}

func bodyTypeStr(html bool) string {
	if html {
		return "HTML"
	}
	return "Text"
}

func (c *ewsClient) markUnread(itemID string) error {
	_, err := c.do(fmt.Sprintf(`
<m:UpdateItem MessageDisposition="SaveOnly" ConflictResolution="AlwaysOverwrite">
  <m:ItemChanges>
    <t:ItemChange>
      <t:ItemId Id="%s"/>
      <t:Updates>
        <t:SetItemField>
          <t:FieldURI FieldURI="message:IsRead"/>
          <t:Message><t:IsRead>false</t:IsRead></t:Message>
        </t:SetItemField>
      </t:Updates>
    </t:ItemChange>
  </m:ItemChanges>
</m:UpdateItem>`, xmlEscape(itemID)), "UpdateItem")
	return err
}

func (c *ewsClient) updateDraftMeta(itemID string, cc, bcc []string, subject string, readReceipt bool) (string, error) {
	var updates strings.Builder
	if subject != "" {
		updates.WriteString(fmt.Sprintf(`
    <t:SetItemField>
      <t:FieldURI FieldURI="item:Subject"/>
      <t:Message><t:Subject>%s</t:Subject></t:Message>
    </t:SetItemField>`, xmlEscape(subject)))
	}
	if len(cc) > 0 {
		updates.WriteString(fmt.Sprintf(`
    <t:SetItemField>
      <t:FieldURI FieldURI="message:CcRecipients"/>
      <t:Message><t:CcRecipients>%s</t:CcRecipients></t:Message>
    </t:SetItemField>`, buildMailboxList(cc)))
	}
	if len(bcc) > 0 {
		updates.WriteString(fmt.Sprintf(`
    <t:SetItemField>
      <t:FieldURI FieldURI="message:BccRecipients"/>
      <t:Message><t:BccRecipients>%s</t:BccRecipients></t:Message>
    </t:SetItemField>`, buildMailboxList(bcc)))
	}
	if readReceipt {
		updates.WriteString(`
    <t:SetItemField>
      <t:FieldURI FieldURI="message:IsReadReceiptRequested"/>
      <t:Message><t:IsReadReceiptRequested>true</t:IsReadReceiptRequested></t:Message>
    </t:SetItemField>`)
	}
	if updates.Len() == 0 {
		return "", nil
	}
	resp, err := c.do(fmt.Sprintf(`
<m:UpdateItem MessageDisposition="SaveOnly" ConflictResolution="AlwaysOverwrite">
  <m:ItemChanges>
    <t:ItemChange>
      <t:ItemId Id="%s"/>
      <t:Updates>%s
      </t:Updates>
    </t:ItemChange>
  </m:ItemChanges>
</m:UpdateItem>`, xmlEscape(itemID), updates.String()), "UpdateItem")
	if err != nil {
		return "", err
	}
	var env ewsEnvelope
	if err := xml.Unmarshal(resp, &env); err != nil {
		return "", nil
	}
	if env.Body.UpdateItemResponse != nil && len(env.Body.UpdateItemResponse.Messages) > 0 {
		m := env.Body.UpdateItemResponse.Messages[0]
		if m.ResponseClass != "Success" {
			return "", fmt.Errorf("UpdateItem failed: %s", m.MessageText)
		}
		if len(m.Items) > 0 {
			return m.Items[0].ItemID.ChangeKey, nil
		}
	}
	return "", nil
}

func (c *ewsClient) sendDraftItem(itemID, changeKey string) error {
	resp, err := c.do(fmt.Sprintf(`
<m:SendItem SaveItemToFolder="true">
  <m:ItemIds>
    <t:ItemId Id="%s" ChangeKey="%s"/>
  </m:ItemIds>
  <m:SavedItemFolderId>
    <t:DistinguishedFolderId Id="sentitems"/>
  </m:SavedItemFolderId>
</m:SendItem>`, xmlEscape(itemID), xmlEscape(changeKey)), "SendItem")
	if err != nil {
		return err
	}
	var env ewsEnvelope
	if err := xml.Unmarshal(resp, &env); err != nil {
		return nil
	}
	if env.Body.SendItemResponse != nil && len(env.Body.SendItemResponse.Messages) > 0 {
		if m := env.Body.SendItemResponse.Messages[0]; m.ResponseClass != "Success" {
			return fmt.Errorf("SendItem failed: %s", m.MessageText)
		}
	}
	return nil
}

func (c *ewsClient) replyItemFull(itemID, body, bodyType string, all bool, cc, bcc []string, subject string, readReceipt bool, attachments []OutboundAttachment) error {
	original, err := c.getFullItem(itemID)
	if err != nil {
		return fmt.Errorf("get original for reply: %w", err)
	}

	element := "ReplyToItem"
	if all {
		element = "ReplyAllToItem"
	}

	resp, err := c.do(fmt.Sprintf(`
<m:CreateItem MessageDisposition="SaveOnly">
  <m:SavedItemFolderId>
    <t:DistinguishedFolderId Id="drafts"/>
  </m:SavedItemFolderId>
  <m:Items>
    <t:%s>
      <t:ReferenceItemId Id="%s" ChangeKey="%s"/>
      <t:NewBodyContent BodyType="%s">%s</t:NewBodyContent>
    </t:%s>
  </m:Items>
</m:CreateItem>`, element, xmlEscape(original.ItemID.ID), xmlEscape(original.ItemID.ChangeKey), bodyType, xmlEscape(body), element), "CreateItem")
	if err != nil {
		return fmt.Errorf("create reply draft: %w", err)
	}
	var env ewsEnvelope
	if err := xml.Unmarshal(resp, &env); err != nil {
		return fmt.Errorf("parse reply draft response: %w", err)
	}
	if env.Body.CreateItemResponse == nil || len(env.Body.CreateItemResponse.Messages) == 0 {
		return fmt.Errorf("create reply draft: empty response")
	}
	msg := env.Body.CreateItemResponse.Messages[0]
	if msg.ResponseClass != "Success" || len(msg.Items) == 0 {
		return fmt.Errorf("create reply draft: %s", msg.MessageText)
	}
	draftID := msg.Items[0].ItemID.ID
	changeKey := msg.Items[0].ItemID.ChangeKey

	if newCK, err := c.updateDraftMeta(draftID, cc, bcc, subject, readReceipt); err != nil {
		return fmt.Errorf("update reply draft: %w", err)
	} else if newCK != "" {
		changeKey = newCK
	}

	if len(attachments) > 0 {
		if newCK, err := c.addAttachmentsToDraft(draftID, changeKey, attachments); err != nil {
			return fmt.Errorf("attach files to reply: %w", err)
		} else if newCK != "" {
			changeKey = newCK
		}
	}

	return c.sendDraftItem(draftID, changeKey)
}

func (c *ewsClient) forwardItemFull(itemID string, to []string, body, bodyType string, cc, bcc []string, readReceipt bool, attachments []OutboundAttachment) error {
	original, err := c.getFullItem(itemID)
	if err != nil {
		return fmt.Errorf("get original for forward: %w", err)
	}

	resp, err := c.do(fmt.Sprintf(`
<m:CreateItem MessageDisposition="SaveOnly">
  <m:SavedItemFolderId>
    <t:DistinguishedFolderId Id="drafts"/>
  </m:SavedItemFolderId>
  <m:Items>
    <t:ForwardItem>
      <t:ReferenceItemId Id="%s" ChangeKey="%s"/>
      <t:NewBodyContent BodyType="%s">%s</t:NewBodyContent>
      <t:ToRecipients>%s</t:ToRecipients>
    </t:ForwardItem>
  </m:Items>
</m:CreateItem>`, xmlEscape(original.ItemID.ID), xmlEscape(original.ItemID.ChangeKey), bodyType, xmlEscape(body), buildMailboxList(to)), "CreateItem")
	if err != nil {
		return fmt.Errorf("create forward draft: %w", err)
	}
	var env ewsEnvelope
	if err := xml.Unmarshal(resp, &env); err != nil {
		return fmt.Errorf("parse forward draft response: %w", err)
	}
	if env.Body.CreateItemResponse == nil || len(env.Body.CreateItemResponse.Messages) == 0 {
		return fmt.Errorf("create forward draft: empty response")
	}
	msg := env.Body.CreateItemResponse.Messages[0]
	if msg.ResponseClass != "Success" || len(msg.Items) == 0 {
		return fmt.Errorf("create forward draft: %s", msg.MessageText)
	}
	draftID := msg.Items[0].ItemID.ID
	changeKey := msg.Items[0].ItemID.ChangeKey

	if newCK, err := c.updateDraftMeta(draftID, cc, bcc, "", readReceipt); err != nil {
		return fmt.Errorf("update forward draft: %w", err)
	} else if newCK != "" {
		changeKey = newCK
	}

	if len(attachments) > 0 {
		if newCK, err := c.addAttachmentsToDraft(draftID, changeKey, attachments); err != nil {
			return fmt.Errorf("attach files to forward: %w", err)
		} else if newCK != "" {
			changeKey = newCK
		}
	}

	return c.sendDraftItem(draftID, changeKey)
}

func (c *ewsClient) addAttachmentsToDraft(itemID, changeKey string, attachments []OutboundAttachment) (string, error) {

	resp, err := c.do(fmt.Sprintf(`
<m:CreateAttachment>
  <m:ParentItemId Id="%s" ChangeKey="%s"/>
  <m:Attachments>%s
  </m:Attachments>
</m:CreateAttachment>`, xmlEscape(itemID), xmlEscape(changeKey), attachmentXML(attachments)), "CreateAttachment")
	if err != nil {
		return "", err
	}
	var env ewsEnvelope
	if err := xml.Unmarshal(resp, &env); err != nil {
		return "", nil
	}
	if env.Body.CreateAttachmentResponse != nil && len(env.Body.CreateAttachmentResponse.Messages) > 0 {
		m := env.Body.CreateAttachmentResponse.Messages[0]
		if m.ResponseClass != "Success" {
			return "", fmt.Errorf("CreateAttachment failed: %s", m.MessageText)
		}
		if len(m.Attachments) > 0 {
			return m.Attachments[len(m.Attachments)-1].AttachmentID.RootItemChangeKey, nil
		}
	}
	return "", nil
}

func xmlEscape(s string) string {
	var b strings.Builder
	xml.EscapeText(&b, []byte(s))
	return b.String()
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
