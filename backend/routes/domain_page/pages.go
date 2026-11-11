package domainpage

import (
	"errors"
	"log/slog"

	"home-v4/backend/services/auth"
	"home-v4/backend/services/domain_page/pages"

	"github.com/gofiber/fiber/v3"
)

type pageUpdate struct {
	Name string `json:"name"`
	pages.Update
}

type pageTarget struct {
	Name string `json:"name"`
}

func PagesRouter(r fiber.Router) {
	r.
		Get("/list", listPages).
		Get("/check", checkPage).
		Post("/new", newPage).
		Post("/update", updatePage).
		Post("/delete", deletePage)
}

func pageOwner(c fiber.Ctx) pages.Owner {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)
	return pages.Owner{ID: user.ID, Name: user.Name}
}

func pageError(c fiber.Ctx, status int, code string) error {
	return c.Status(status).JSON(fiber.Map{"error": code})
}

func pageResult(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, pages.ErrInvalidName):
		return pageError(c, fiber.StatusBadRequest, "invalid_name")
	case errors.Is(err, pages.ErrInvalidInput):
		return pageError(c, fiber.StatusBadRequest, "invalid_input")
	case errors.Is(err, pages.ErrNameTaken):
		return pageError(c, fiber.StatusConflict, "name_taken")
	case errors.Is(err, pages.ErrSourceNotFound):
		return pageError(c, fiber.StatusUnprocessableEntity, "source_not_found")
	case errors.Is(err, pages.ErrNotFound):
		return pageError(c, fiber.StatusNotFound, "not_found")
	}

	slog.Warn("pages: request failed", "err", err)
	return pageError(c, fiber.StatusInternalServerError, "internal")
}

func listPages(c fiber.Ctx) error {
	list, err := pages.List(pageOwner(c))
	if err != nil {
		return pageResult(c, err)
	}

	return c.JSON(fiber.Map{"pages": list})
}

func checkPage(c fiber.Ctx) error {
	return c.JSON(pages.Check(c.Query("name")))
}

func newPage(c fiber.Ctx) error {
	var body pages.Input
	if err := c.Bind().JSON(&body); err != nil {
		return pageError(c, fiber.StatusBadRequest, "invalid_body")
	}

	page, err := pages.Create(pageOwner(c), body)
	if err != nil {
		return pageResult(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(page)
}

func updatePage(c fiber.Ctx) error {
	var body pageUpdate
	if err := c.Bind().JSON(&body); err != nil {
		return pageError(c, fiber.StatusBadRequest, "invalid_body")
	}

	page, err := pages.Edit(pageOwner(c), body.Name, body.Update)
	if err != nil {
		return pageResult(c, err)
	}

	return c.JSON(page)
}

func deletePage(c fiber.Ctx) error {
	var body pageTarget
	if err := c.Bind().JSON(&body); err != nil {
		return pageError(c, fiber.StatusBadRequest, "invalid_body")
	}

	if err := pages.Delete(pageOwner(c), body.Name); err != nil {
		return pageResult(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}
