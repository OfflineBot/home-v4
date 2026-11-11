package domainpage

import (
	"bufio"
	"bytes"
	"errors"
	"io"
	"log/slog"
	"mime"

	"home-v4/backend/services/auth"
	"home-v4/backend/services/domain_page/files"

	"github.com/gofiber/fiber/v3"
)

const FilesUploadPath = "/api/files/upload"

type filesPath struct {
	Path string `json:"path"`
}

type filesArchiveTarget struct {
	ID        string `json:"id"`
	Path      string `json:"path"`
	Overwrite bool   `json:"overwrite"`
}

type filesMove struct {
	From      string `json:"from"`
	To        string `json:"to"`
	Overwrite bool   `json:"overwrite"`
}

func FilesRouter(r fiber.Router) {
	r.
		Get("/list", listFiles).
		Get("/download", downloadFile).
		Get("/zip", zipFolder).
		Get("/usage", filesUsage).
		Put("/upload", uploadFile).
		Post("/mkdir", makeFolder).
		Post("/move", moveFile).
		Post("/delete", deleteFile).
		Get("/archive", listArchive).
		Post("/archive/restore", restoreArchived).
		Post("/archive/delete", purgeArchived).
		Post("/archive/empty", emptyArchive)
}

func filesOwner(c fiber.Ctx) files.Owner {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)
	return files.Owner{ID: user.ID, Name: user.Name}
}

func filesError(c fiber.Ctx, status int, code string) error {
	return c.Status(status).JSON(fiber.Map{"error": code})
}

func filesResult(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, files.ErrInvalidPath):
		return filesError(c, fiber.StatusBadRequest, "invalid_path")
	case errors.Is(err, files.ErrRoot):
		return filesError(c, fiber.StatusBadRequest, "root")
	case errors.Is(err, files.ErrIntoItself):
		return filesError(c, fiber.StatusBadRequest, "into_itself")
	case errors.Is(err, files.ErrNotFound), errors.Is(err, files.ErrArchiveNotFound):
		return filesError(c, fiber.StatusNotFound, "not_found")
	case errors.Is(err, files.ErrExists):
		return filesError(c, fiber.StatusConflict, "exists")
	case errors.Is(err, files.ErrNotDir):
		return filesError(c, fiber.StatusConflict, "not_a_folder")
	case errors.Is(err, files.ErrIsDir):
		return filesError(c, fiber.StatusConflict, "is_a_folder")
	case errors.Is(err, files.ErrUnavailable):
		return filesError(c, fiber.StatusServiceUnavailable, "unavailable")
	}

	slog.Warn("files: request failed", "err", err)
	return filesError(c, fiber.StatusInternalServerError, "internal")
}

func listFiles(c fiber.Ctx) error {
	listing, err := files.List(filesOwner(c), c.Query("path", "/"))
	if err != nil {
		return filesResult(c, err)
	}

	return c.JSON(listing)
}

func downloadFile(c fiber.Ctx) error {
	download, err := files.Open(filesOwner(c), c.Query("path"))
	if err != nil {
		return filesResult(c, err)
	}

	return sendFile(c, download.File, download.Name, download.MimeType)
}

func zipFolder(c fiber.Ctx) error {
	name, write, err := files.Zip(filesOwner(c), c.Query("path", "/"))
	if err != nil {
		return filesResult(c, err)
	}

	disposition := "attachment"
	if header := mime.FormatMediaType(disposition, map[string]string{"filename": name}); header != "" {
		disposition = header
	}
	c.Set(fiber.HeaderContentType, "application/zip")
	c.Set(fiber.HeaderContentDisposition, disposition)

	return c.SendStreamWriter(func(w *bufio.Writer) {
		if err := write(w); err != nil {
			slog.Warn("files: zip stream failed", "err", err)
			return
		}
		w.Flush()
	})
}

func filesUsage(c fiber.Ctx) error {
	usage, err := files.UsageOf(filesOwner(c))
	if err != nil {
		return filesResult(c, err)
	}

	return c.JSON(usage)
}

func uploadFile(c fiber.Ctx) error {
	var body io.Reader = c.Request().BodyStream()
	if body == nil {
		body = bytes.NewReader(c.Body())
	}

	entry, err := files.Upload(filesOwner(c), c.Query("path"), body, fiber.Query[bool](c, "overwrite"))
	if err != nil {
		return filesResult(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(entry)
}

func makeFolder(c fiber.Ctx) error {
	var body filesPath
	if err := c.Bind().JSON(&body); err != nil {
		return filesError(c, fiber.StatusBadRequest, "invalid_body")
	}

	entry, err := files.Mkdir(filesOwner(c), body.Path)
	if err != nil {
		return filesResult(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(entry)
}

func moveFile(c fiber.Ctx) error {
	var body filesMove
	if err := c.Bind().JSON(&body); err != nil {
		return filesError(c, fiber.StatusBadRequest, "invalid_body")
	}

	entry, err := files.Move(filesOwner(c), body.From, body.To, body.Overwrite)
	if err != nil {
		return filesResult(c, err)
	}

	return c.JSON(entry)
}

func deleteFile(c fiber.Ctx) error {
	var body filesPath
	if err := c.Bind().JSON(&body); err != nil {
		return filesError(c, fiber.StatusBadRequest, "invalid_body")
	}

	item, err := files.Delete(filesOwner(c), body.Path)
	if err != nil {
		return filesResult(c, err)
	}

	return c.JSON(item)
}

func listArchive(c fiber.Ctx) error {
	listing, err := files.Archived(filesOwner(c))
	if err != nil {
		return filesResult(c, err)
	}

	return c.JSON(listing)
}

func restoreArchived(c fiber.Ctx) error {
	var body filesArchiveTarget
	if err := c.Bind().JSON(&body); err != nil {
		return filesError(c, fiber.StatusBadRequest, "invalid_body")
	}

	entry, err := files.Restore(filesOwner(c), body.ID, body.Path, body.Overwrite)
	if err != nil {
		return filesResult(c, err)
	}

	return c.JSON(entry)
}

func purgeArchived(c fiber.Ctx) error {
	var body filesArchiveTarget
	if err := c.Bind().JSON(&body); err != nil {
		return filesError(c, fiber.StatusBadRequest, "invalid_body")
	}

	if err := files.Purge(filesOwner(c), body.ID); err != nil {
		return filesResult(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func emptyArchive(c fiber.Ctx) error {
	if err := files.PurgeAll(filesOwner(c)); err != nil {
		return filesResult(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}
