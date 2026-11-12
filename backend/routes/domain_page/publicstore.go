package domainpage

import (
	"bytes"
	"errors"
	"io"
	"strings"

	"home-v4/backend/services/auth"
	"home-v4/backend/services/domain_page/publicstore"

	"github.com/gofiber/fiber/v3"
)

const (
	PublicStorePrefix = "/api/public/"
	PublicUploadPath  = "/api/public/upload"
	publicManageSlug  = "manage/"
)

func PublicStoreRouter(r fiber.Router) {
	r.
		Get("/files", listPublicFiles).
		Get("/files/:id", downloadPublicFile).
		Get("/files/:id/:name", downloadPublicFile).
		Put("/upload", uploadPublicFile).
		Post("/upload", uploadPublicFile)

	r.Group("/manage").
		Get("/settings", publicStoreSettings).
		Post("/settings", setPublicStoreSettings).
		Post("/settings/key", rotatePublicStoreKey).
		Post("/delete", deletePublicFile)
}

func IsPublicStorePath(c fiber.Ctx) bool {
	path := c.Path()

	return strings.HasPrefix(path, PublicStorePrefix) &&
		!strings.HasPrefix(path, PublicStorePrefix+publicManageSlug)
}

type publicTarget struct {
	ID string `json:"id"`
}

type publicSettingsInput struct {
	UploadsOpen *bool `json:"uploads_open"`
}

func publicError(c fiber.Ctx, status int, code string) error {
	return c.Status(status).JSON(fiber.Map{"error": code})
}

func publicResult(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, publicstore.ErrNotFound):
		return publicError(c, fiber.StatusNotFound, "not_found")
	case errors.Is(err, publicstore.ErrInvalidName):
		return publicError(c, fiber.StatusBadRequest, "invalid_name")
	case errors.Is(err, publicstore.ErrTooLarge):
		return publicError(c, fiber.StatusRequestEntityTooLarge, "too_large")
	case errors.Is(err, publicstore.ErrFull):
		return publicError(c, fiber.StatusInsufficientStorage, "store_full")
	case errors.Is(err, publicstore.ErrClosed):
		return publicError(c, fiber.StatusUnauthorized, "uploads_closed")
	default:
		return publicError(c, fiber.StatusInternalServerError, "internal")
	}
}

func listPublicFiles(c fiber.Ctx) error {
	files, err := publicstore.List()
	if err != nil {
		return publicResult(c, err)
	}

	usage, err := publicstore.CurrentUsage()
	if err != nil {
		return publicResult(c, err)
	}

	return c.JSON(fiber.Map{"files": files, "usage": usage})
}

func downloadPublicFile(c fiber.Ctx) error {
	file, handle, err := publicstore.Open(c.Params("id"))
	if err != nil {
		return publicResult(c, err)
	}

	return sendFile(c, handle, file.Name, file.ContentType)
}

func uploadPublicFile(c fiber.Ctx) error {
	allowed, err := publicstore.MayUpload(firstFilled(c.Query("key"), c.Get("X-Upload-Key")))
	if err != nil {
		return publicResult(c, err)
	}
	if !allowed {
		return publicResult(c, publicstore.ErrClosed)
	}

	name := firstFilled(c.Query("name"), c.Get("X-File-Name"))
	uploader := strings.TrimSpace(c.Query("from"))

	var body io.Reader = c.Request().BodyStream()
	if body == nil {
		body = bytes.NewReader(c.Body())
	}

	if form, formErr := c.FormFile("file"); formErr == nil {
		opened, openErr := form.Open()
		if openErr != nil {
			return publicResult(c, openErr)
		}
		defer opened.Close()
		body = opened
		if name == "" {
			name = form.Filename
		}
	}

	file, err := publicstore.Upload(name, uploader, body)
	if err != nil {
		return publicResult(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(file)
}

func publicStoreSettings(c fiber.Ctx) error {
	settings, err := publicstore.CurrentSettings()
	if err != nil {
		return publicResult(c, err)
	}

	return c.JSON(settings)
}

func setPublicStoreSettings(c fiber.Ctx) error {
	var body publicSettingsInput
	if err := c.Bind().JSON(&body); err != nil || body.UploadsOpen == nil {
		return publicError(c, fiber.StatusBadRequest, "invalid_body")
	}

	if err := publicstore.SetUploadsOpen(*body.UploadsOpen); err != nil {
		return publicResult(c, err)
	}

	return publicStoreSettings(c)
}

func rotatePublicStoreKey(c fiber.Ctx) error {
	if _, err := publicstore.RotateKey(); err != nil {
		return publicResult(c, err)
	}

	return publicStoreSettings(c)
}

func deletePublicFile(c fiber.Ctx) error {
	var body publicTarget
	if err := c.Bind().JSON(&body); err != nil || body.ID == "" {
		return publicError(c, fiber.StatusBadRequest, "invalid_body")
	}

	_ = fiber.Locals[*auth.User](c, auth.ContextKey)
	if err := publicstore.Delete(body.ID); err != nil {
		return publicResult(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}
