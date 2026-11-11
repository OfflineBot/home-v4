package domainpage

import (
	"errors"
	"time"

	"home-v4/backend/services/auth"
	"home-v4/backend/services/domain_page/calendar"
	"home-v4/libs/timetable"

	"github.com/gofiber/fiber/v3"
)

func CalendarRouter(r fiber.Router) {
	r.
		Get("/events", calendarEvents).
		Post("/events", calendarSaveEvent).
		Post("/events/:id/delete", calendarDeleteEvent).
		Post("/events/:id/mark", calendarMarkEvent).
		Get("/timetable/sites", calendarSites).
		Get("/timetable/courses", calendarCourses).
		Get("/categories", calendarCategories).
		Post("/categories", calendarSaveCategory).
		Post("/categories/:id/delete", calendarDeleteCategory)
}

type markBody struct {
	Mark *string `json:"mark"`
}

func calendarError(c fiber.Ctx, status int, code string) error {
	return c.Status(status).JSON(fiber.Map{"error": code})
}

func calendarResult(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, calendar.ErrNotFound):
		return calendarError(c, fiber.StatusNotFound, "not_found")
	case errors.Is(err, calendar.ErrInvalidEvent):
		return calendarError(c, fiber.StatusBadRequest, "invalid_event")
	case errors.Is(err, calendar.ErrInvalidCategory):
		return calendarError(c, fiber.StatusBadRequest, "invalid_category")
	case errors.Is(err, calendar.ErrInvalidMark):
		return calendarError(c, fiber.StatusBadRequest, "invalid_mark")
	case errors.Is(err, calendar.ErrProtected):
		return calendarError(c, fiber.StatusConflict, "protected")
	default:
		return calendarError(c, fiber.StatusInternalServerError, "internal")
	}
}

func calendarEvents(c fiber.Ctx) error {
	from, to, err := calendar.ParseRange(c.Query("from"), c.Query("to"))
	if err != nil {
		return calendarError(c, fiber.StatusBadRequest, "invalid_range")
	}

	filter, err := calendar.ParseFilter(c.Query("categories"), c.Query("marks"), c.Query("sources"), c.Query("visible"))
	if err != nil {
		return calendarError(c, fiber.StatusBadRequest, "invalid_filter")
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	events, err := calendar.Events(user.ID, from, to, filter)
	if err != nil {
		return calendarResult(c, err)
	}

	return c.JSON(fiber.Map{
		"from":   from.UTC().Format(time.RFC3339),
		"to":     to.UTC().Format(time.RFC3339),
		"events": events,
	})
}

func calendarSaveEvent(c fiber.Ctx) error {
	var body calendar.EventInput
	if err := c.Bind().JSON(&body); err != nil {
		return calendarError(c, fiber.StatusBadRequest, "invalid_body")
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	event, err := calendar.SaveEvent(user.ID, body)
	if err != nil {
		return calendarResult(c, err)
	}

	return c.JSON(event)
}

func calendarDeleteEvent(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	if err := calendar.DeleteEvent(user.ID, c.Params("id")); err != nil {
		return calendarResult(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func calendarMarkEvent(c fiber.Ctx) error {
	var body markBody
	if err := c.Bind().JSON(&body); err != nil {
		return calendarError(c, fiber.StatusBadRequest, "invalid_body")
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	if err := calendar.SetMark(user.ID, c.Params("id"), body.Mark); err != nil {
		return calendarResult(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func calendarCategories(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	categories, err := calendar.Categories(user.ID)
	if err != nil {
		return calendarResult(c, err)
	}

	return c.JSON(fiber.Map{"categories": categories})
}

func calendarSaveCategory(c fiber.Ctx) error {
	var body calendar.CategoryInput
	if err := c.Bind().JSON(&body); err != nil {
		return calendarError(c, fiber.StatusBadRequest, "invalid_body")
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	category, err := calendar.SaveCategory(user.ID, body)
	if err != nil {
		return calendarResult(c, err)
	}

	return c.JSON(category)
}

func calendarDeleteCategory(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	if err := calendar.DeleteCategory(user.ID, c.Params("id")); err != nil {
		return calendarResult(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func calendarSites(c fiber.Ctx) error {
	sites, err := calendar.Sites()
	if err != nil {
		return calendarError(c, fiber.StatusBadGateway, "unreachable")
	}

	return c.JSON(fiber.Map{"sites": sites})
}

func calendarCourses(c fiber.Ctx) error {
	list, err := calendar.Courses(c.Query("site"))
	switch {
	case err == nil:
		return c.JSON(list)
	case errors.Is(err, calendar.ErrInvalidCourse):
		return calendarError(c, fiber.StatusBadRequest, "invalid_site")
	case errors.Is(err, timetable.ErrNotFound):
		return calendarError(c, fiber.StatusNotFound, "unknown_site")
	default:
		return calendarError(c, fiber.StatusBadGateway, "unreachable")
	}
}
