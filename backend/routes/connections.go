package routes

import (
	"errors"
	"strconv"
	"time"

	"home-v4/backend/services/auth"
	"home-v4/backend/services/connections"
	"home-v4/backend/services/domain_page/calendar"
	"home-v4/backend/services/syncer"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/limiter"
)

const (
	verifyRateMax    = 10
	verifyRateWindow = time.Minute
)

func connectionsRouter(r fiber.Router) {
	verifyLimit := limiter.New(limiter.Config{
		Max:        verifyRateMax,
		Expiration: verifyRateWindow,
		KeyGenerator: func(c fiber.Ctx) string {
			return strconv.FormatInt(fiber.Locals[*auth.User](c, auth.ContextKey).ID, 10)
		},
		LimitReached: func(c fiber.Ctx) error {
			return connectionsError(c, fiber.StatusTooManyRequests, "too_many_attempts", "")
		},
	})

	r.Group("/dhbw").
		Get("/", dhbwStatus).
		Post("/name", verifyLimit, dhbwSetName).
		Post("/name/delete", dhbwDeleteName).
		Post("/passwords/delete", dhbwDeletePasswords).
		Post("/dualis/reset", dualisReset).
		Post("/:module/password", verifyLimit, dhbwSetPassword).
		Post("/:module/password/delete", dhbwDeletePassword)

	r.Group("/timetable").
		Get("/", timetableStatus).
		Post("/", verifyLimit, timetableSet).
		Post("/delete", timetableDelete)
}

type dhbwName struct {
	Name string `json:"name"`
}

type timetableCourse struct {
	Site   string `json:"site"`
	Course string `json:"course"`
}

type dhbwPassword struct {
	Password string `json:"password"`
}

type resetBody struct {
	Confirm bool `json:"confirm"`
}

func connectionsError(c fiber.Ctx, status int, code string, module connections.Module) error {
	body := fiber.Map{"error": code}
	if module != "" {
		body["module"] = module
	}

	return c.Status(status).JSON(body)
}

func connectionsResult(c fiber.Ctx, err error) error {
	var module connections.Module
	var moduleErr *connections.ModuleError
	if errors.As(err, &moduleErr) {
		module = moduleErr.Module
	}

	switch {
	case err == nil:
		return c.SendStatus(fiber.StatusNoContent)
	case errors.Is(err, connections.ErrInvalidName):
		return connectionsError(c, fiber.StatusBadRequest, "invalid_name", "")
	case errors.Is(err, connections.ErrInvalidPassword):
		return connectionsError(c, fiber.StatusBadRequest, "invalid_password", "")
	case errors.Is(err, connections.ErrUnknownModule):
		return connectionsError(c, fiber.StatusNotFound, "unknown_module", "")
	case errors.Is(err, connections.ErrNameMissing):
		return connectionsError(c, fiber.StatusPreconditionFailed, "name_missing", "")
	case errors.Is(err, connections.ErrDualisLocked):
		return connectionsError(c, fiber.StatusLocked, "locked", connections.Dualis)
	case errors.Is(err, connections.ErrDualisBackoff):
		return connectionsError(c, fiber.StatusTooManyRequests, "backoff", connections.Dualis)
	case errors.Is(err, connections.ErrLoginFailed):
		return connectionsError(c, fiber.StatusUnprocessableEntity, "login_failed", module)
	case errors.Is(err, connections.ErrVerifyFailed):
		return connectionsError(c, fiber.StatusBadGateway, "verify_failed", module)
	default:
		return connectionsError(c, fiber.StatusInternalServerError, "internal", "")
	}
}

func dhbwStatus(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	status, err := connections.StatusByUser(user.ID)
	if err != nil {
		return fiber.ErrInternalServerError
	}

	return c.JSON(status)
}

func dhbwSetName(c fiber.Ctx) error {
	var body dhbwName
	if err := c.Bind().JSON(&body); err != nil {
		return connectionsError(c, fiber.StatusBadRequest, "invalid_body", "")
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)
	err := connections.SetName(user.ID, body.Name)
	if err == nil {
		for _, module := range connections.Modules {
			syncer.Trigger(user.ID, string(module))
		}
	}

	return connectionsResult(c, err)
}

func dhbwDeleteName(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)
	return connectionsResult(c, connections.RemoveName(user.ID))
}

func dhbwSetPassword(c fiber.Ctx) error {
	var body dhbwPassword
	if err := c.Bind().JSON(&body); err != nil {
		return connectionsError(c, fiber.StatusBadRequest, "invalid_body", "")
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)
	module := connections.Module(c.Params("module"))
	err := connections.SetPassword(user.ID, module, body.Password)
	if err == nil {
		syncer.Trigger(user.ID, string(module))
	}

	return connectionsResult(c, err)
}

func dhbwDeletePassword(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)
	module := connections.Module(c.Params("module"))
	return connectionsResult(c, connections.RemovePassword(user.ID, module))
}

func dhbwDeletePasswords(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)
	return connectionsResult(c, connections.RemovePasswords(user.ID))
}

func timetableStatus(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	course, err := calendar.TimetableCourse(user.ID)
	if err != nil {
		return fiber.ErrInternalServerError
	}

	return c.JSON(fiber.Map{"course": course})
}

func timetableSet(c fiber.Ctx) error {
	var body timetableCourse
	if err := c.Bind().JSON(&body); err != nil {
		return connectionsError(c, fiber.StatusBadRequest, "invalid_body", "")
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	err := calendar.SetTimetable(user.ID, body.Site, body.Course)
	switch {
	case err == nil:
		syncer.Trigger(user.ID, calendar.Timetable)
		return c.SendStatus(fiber.StatusNoContent)
	case errors.Is(err, calendar.ErrInvalidCourse):
		return connectionsError(c, fiber.StatusBadRequest, "invalid_course", "")
	case errors.Is(err, calendar.ErrUnknownCourse):
		return connectionsError(c, fiber.StatusUnprocessableEntity, "unknown_course", "")
	case errors.Is(err, calendar.ErrVerifyFailed):
		return connectionsError(c, fiber.StatusBadGateway, "verify_failed", "")
	default:
		return connectionsError(c, fiber.StatusInternalServerError, "internal", "")
	}
}

func timetableDelete(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	if err := calendar.RemoveTimetable(user.ID); err != nil {
		return connectionsError(c, fiber.StatusInternalServerError, "internal", "")
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func dualisReset(c fiber.Ctx) error {
	var body resetBody
	if err := c.Bind().JSON(&body); err != nil {
		return connectionsError(c, fiber.StatusBadRequest, "invalid_body", "")
	}
	if !body.Confirm {
		return connectionsError(c, fiber.StatusBadRequest, "confirm_required", connections.Dualis)
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)
	if err := connections.ResetDualis(user.ID); err != nil {
		return connectionsError(c, fiber.StatusInternalServerError, "internal", "")
	}

	return c.SendStatus(fiber.StatusNoContent)
}
