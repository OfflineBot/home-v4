package domainpage

import (
	"archive/zip"
	"bufio"
	"errors"
	"io"
	"log/slog"
	"mime"
	"strconv"

	"home-v4/backend/services/auth"
	"home-v4/backend/services/domain_page/moodle"
	"home-v4/backend/services/storage"

	"github.com/gofiber/fiber/v3"
)

func MoodleRouter(r fiber.Router) {
	r.
		Get("/courses", moodleCourses).
		Get("/semesters", moodleSemesters).
		Post("/placements", moodlePlacements).
		Get("/courses/:id", moodleCourse).
		Post("/courses/:id/placement/delete", moodlePlacementReset).
		Get("/courses/:id/image", moodleCourseImage).
		Get("/courses/:id/zip", moodleCourseZip).
		Get("/modules/:id", moodleModule).
		Get("/grades", moodleGrades).
		Get("/files/:id", moodleFile).
		Get("/assets/:id", moodleAsset)
}

type placementsBody struct {
	Placements []moodle.Placement `json:"placements"`
}

func moodleResult(err error) error {
	switch {
	case errors.Is(err, moodle.ErrNotFound):
		return fiber.ErrNotFound
	case errors.Is(err, moodle.ErrInvalidPlacement):
		return fiber.ErrBadRequest
	case errors.Is(err, moodle.ErrUnavailable):
		return fiber.ErrBadGateway
	default:
		return fiber.ErrInternalServerError
	}
}

func idParam(c fiber.Ctx) (int64, error) {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return 0, fiber.ErrBadRequest
	}

	return id, nil
}

func moodleCourses(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	courses, err := moodle.Courses(user.ID)
	if err != nil {
		return fiber.ErrInternalServerError
	}

	return c.JSON(fiber.Map{"courses": courses})
}

func moodleSemesters(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	semesters, err := moodle.Semesters(user.ID)
	if err != nil {
		return fiber.ErrInternalServerError
	}

	return c.JSON(fiber.Map{"semesters": semesters})
}

func moodlePlacements(c fiber.Ctx) error {
	var body placementsBody
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.ErrBadRequest
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)
	if err := moodle.SetPlacements(user.ID, body.Placements); err != nil {
		return moodleResult(err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func moodlePlacementReset(c fiber.Ctx) error {
	id, err := idParam(c)
	if err != nil {
		return err
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)
	if err := moodle.ResetPlacement(user.ID, id); err != nil {
		return moodleResult(err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func moodleCourse(c fiber.Ctx) error {
	id, err := idParam(c)
	if err != nil {
		return err
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	detail, err := moodle.CourseWithContents(user.ID, id)
	if err != nil {
		return moodleResult(err)
	}

	return c.JSON(detail)
}

func moodleModule(c fiber.Ctx) error {
	id, err := idParam(c)
	if err != nil {
		return err
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	module, err := moodle.ModuleByID(user.ID, id)
	if err != nil {
		return moodleResult(err)
	}

	return c.JSON(module)
}

func moodleGrades(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	courses, err := moodle.GradesByCourse(user.ID)
	if err != nil {
		return fiber.ErrInternalServerError
	}

	return c.JSON(fiber.Map{"courses": courses})
}

func moodleCourseImage(c fiber.Ctx) error {
	id, err := idParam(c)
	if err != nil {
		return err
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	course, err := moodle.CourseImage(user.ID, id)
	if err != nil {
		return moodleResult(err)
	}

	return sendStored(c, *course.ImagePath, course.Shortname, course.ImageType)
}

func moodleFile(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	file, err := moodle.FileByID(user.ID, c.Params("id"))
	if err != nil {
		return moodleResult(err)
	}

	return sendStored(c, *file.Path, file.Filename, file.Mimetype)
}

func moodleAsset(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	asset, err := moodle.AssetByID(user.ID, c.Params("id"))
	if err != nil {
		return moodleResult(err)
	}

	return sendStored(c, *asset.Path, moodle.AssetName(asset), asset.Mimetype)
}

func moodleCourseZip(c fiber.Ctx) error {
	id, err := idParam(c)
	if err != nil {
		return err
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	name, entries, err := moodle.CourseArchive(user.ID, id)
	if err != nil {
		return moodleResult(err)
	}

	disposition := "attachment"
	if header := mime.FormatMediaType(disposition, map[string]string{"filename": name}); header != "" {
		disposition = header
	}
	c.Set(fiber.HeaderContentType, "application/zip")
	c.Set(fiber.HeaderContentDisposition, disposition)

	return c.SendStreamWriter(func(w *bufio.Writer) {
		if err := writeArchive(w, entries); err != nil {
			slog.Warn("moodle: zip stream failed", "course", id, "err", err)
		}
	})
}

func writeArchive(w *bufio.Writer, entries []moodle.ArchiveEntry) error {
	archive := zip.NewWriter(w)

	for _, entry := range entries {
		method := zip.Store
		if entry.Compress {
			method = zip.Deflate
		}

		out, err := archive.CreateHeader(&zip.FileHeader{Name: entry.Name, Method: method, Modified: entry.Modified})
		if err != nil {
			return err
		}

		if entry.Content != nil {
			if _, err := out.Write(entry.Content); err != nil {
				return err
			}
			continue
		}

		if err := copyStored(out, entry.Path); err != nil {
			return err
		}
	}

	if err := archive.Close(); err != nil {
		return err
	}

	return w.Flush()
}

func copyStored(out io.Writer, name string) error {
	f, err := storage.Open(name)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = io.Copy(out, f)
	return err
}
