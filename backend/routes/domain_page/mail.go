package domainpage

import (
	"bufio"
	"errors"
	"log/slog"
	"mime"
	"strconv"
	"strings"
	"time"

	"home-v4/backend/services/auth"
	"home-v4/backend/services/connections"
	"home-v4/backend/services/domain_page/mail"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/limiter"
)

const defaultMailFolder = "inbox"

func MailRouter(r fiber.Router) {
	r.
		Get("/folders", mailFolders).
		Get("/messages", mailMessages).
		Get("/messages/:id", mailMessage).
		Post("/messages/read", setMailRead).
		Get("/attachments/:id", mailAttachment).
		Get("/contacts", mailContacts).
		Get("/contacts/directory", directoryLimit(), mailDirectory).
		Get("/export", mailExport)
}

var exportTypes = map[string]string{
	mail.FormatJSON:  "application/json; charset=utf-8",
	mail.FormatJSONL: "application/x-ndjson; charset=utf-8",
}

const (
	directoryRateMax    = 30
	directoryRateWindow = time.Minute
)

func directoryLimit() fiber.Handler {
	return limiter.New(limiter.Config{
		Max:        directoryRateMax,
		Expiration: directoryRateWindow,
		KeyGenerator: func(c fiber.Ctx) string {
			return strconv.FormatInt(fiber.Locals[*auth.User](c, auth.ContextKey).ID, 10)
		},
		LimitReached: func(c fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "too_many_requests"})
		},
	})
}

func mailResult(err error) error {
	switch {
	case errors.Is(err, mail.ErrNotFound), errors.Is(err, mail.ErrUnknownFolder):
		return fiber.ErrNotFound
	case errors.Is(err, mail.ErrUnavailable):
		return fiber.ErrBadGateway
	default:
		return fiber.ErrInternalServerError
	}
}

func mailFolders(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	folders, err := mail.Folders(user.ID)
	if err != nil {
		return fiber.ErrInternalServerError
	}

	return c.JSON(fiber.Map{"folders": folders})
}

func mailMessages(c fiber.Ctx) error {
	limit, err := strconv.Atoi(c.Query("limit", strconv.Itoa(mail.DefaultLimit)))
	if err != nil {
		return fiber.ErrBadRequest
	}
	offset, err := strconv.Atoi(c.Query("offset", "0"))
	if err != nil {
		return fiber.ErrBadRequest
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	filter := mail.Filter{
		UnreadOnly:      c.Query("unread") == "true",
		AttachmentsOnly: c.Query("attachments") == "true",
		Query:           strings.TrimSpace(c.Query("q")),
	}

	messages, total, err := mail.Messages(user.ID, c.Query("folder", defaultMailFolder), filter, limit, offset)
	if err != nil {
		return mailResult(err)
	}

	return c.JSON(fiber.Map{"messages": messages, "total": total})
}

type mailReadInput struct {
	ID   string `json:"id"`
	Read bool   `json:"read"`
}

func setMailRead(c fiber.Ctx) error {
	var body mailReadInput
	if err := c.Bind().JSON(&body); err != nil || body.ID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid_body"})
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)
	if err := mail.SetRead(user.ID, body.ID, body.Read); err != nil {
		return mailResult(err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func mailMessage(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	detail, err := mail.MessageByID(user.ID, c.Params("id"))
	if err != nil {
		return mailResult(err)
	}

	return c.JSON(detail)
}

func mailAttachment(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	attachment, err := mail.AttachmentByID(user.ID, c.Params("id"))
	if err != nil {
		return mailResult(err)
	}

	return sendStored(c, *attachment.Path, attachment.Filename, attachment.ContentType)
}

func mailContacts(c fiber.Ctx) error {
	limit, err := strconv.Atoi(c.Query("limit", strconv.Itoa(mail.DefaultSuggest)))
	if err != nil {
		return fiber.ErrBadRequest
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	contacts, err := mail.Suggest(user.ID, c.Query("q"), limit)
	if err != nil {
		return mailResult(err)
	}

	return c.JSON(fiber.Map{"contacts": contacts})
}

func mailDirectory(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	contacts, err := mail.Directory(user.ID, c.Query("q"))
	switch {
	case err == nil:
		return c.JSON(fiber.Map{"contacts": contacts})
	case errors.Is(err, mail.ErrQueryTooShort):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "query_too_short"})
	case errors.Is(err, connections.ErrNotConfigured):
		return c.Status(fiber.StatusPreconditionFailed).JSON(fiber.Map{"error": "not_configured"})
	case errors.Is(err, mail.ErrUnavailable):
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "unavailable"})
	default:
		return mailResult(err)
	}
}

func mailExport(c fiber.Ctx) error {
	opts := mail.ExportOptions{
		Format: strings.ToLower(c.Query("format", mail.FormatJSON)),
		HTML:   fiber.Query[bool](c, "html"),
	}
	for _, folder := range strings.Split(c.Query("folders"), ",") {
		if folder = strings.TrimSpace(folder); folder != "" {
			opts.Folders = append(opts.Folders, folder)
		}
	}
	if err := mail.ValidateExport(opts); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid_export"})
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	disposition := "attachment"
	if header := mime.FormatMediaType(disposition, map[string]string{"filename": mail.ExportFilename(opts.Format)}); header != "" {
		disposition = header
	}
	c.Set(fiber.HeaderContentType, exportTypes[opts.Format])
	c.Set(fiber.HeaderContentDisposition, disposition)
	c.Set(fiber.HeaderCacheControl, "no-store")

	return c.SendStreamWriter(func(w *bufio.Writer) {
		if err := mail.Export(user.ID, opts, w); err != nil {
			slog.Warn("mail: export failed", "err", err)
			return
		}
		w.Flush()
	})
}
