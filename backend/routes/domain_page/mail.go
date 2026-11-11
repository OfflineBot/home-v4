package domainpage

import (
	"errors"
	"strconv"
	"time"

	"home-v4/backend/services/auth"
	"home-v4/backend/services/domain_page/mail"

	"home-v4/backend/services/connections"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/limiter"
)

const defaultMailFolder = "inbox"

func MailRouter(r fiber.Router) {
	r.
		Get("/folders", mailFolders).
		Get("/messages", mailMessages).
		Get("/messages/:id", mailMessage).
		Get("/attachments/:id", mailAttachment).
		Get("/contacts", mailContacts).
		Get("/contacts/directory", directoryLimit(), mailDirectory)
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

	messages, total, err := mail.Messages(user.ID, c.Query("folder", defaultMailFolder), limit, offset)
	if err != nil {
		return mailResult(err)
	}

	return c.JSON(fiber.Map{"messages": messages, "total": total})
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
