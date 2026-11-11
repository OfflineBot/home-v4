package routes

import (
	"errors"
	"strconv"
	"time"

	"home-v4/backend/services/auth"
	"home-v4/backend/services/connections"
	"home-v4/backend/services/syncer"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/limiter"
)

const (
	syncRateMax    = 6
	syncRateWindow = time.Minute
)

func syncRouter(r fiber.Router) {
	syncLimit := limiter.New(limiter.Config{
		Max:        syncRateMax,
		Expiration: syncRateWindow,
		KeyGenerator: func(c fiber.Ctx) string {
			return strconv.FormatInt(fiber.Locals[*auth.User](c, auth.ContextKey).ID, 10)
		},
		LimitReached: func(c fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "too_many_attempts"})
		},
	})

	r.
		Get("/", syncStatus).
		Post("/:job", syncLimit, syncTrigger).
		Post("/:job/interval", syncInterval)
}

type intervalBody struct {
	Minutes *int64 `json:"minutes"`
}

func syncStatus(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	states, err := syncer.States(user.ID)
	if err != nil {
		return fiber.ErrInternalServerError
	}

	return c.JSON(fiber.Map{"jobs": states})
}

func syncTrigger(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	err := syncer.Trigger(user.ID, c.Params("job"))
	switch {
	case err == nil:
		return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"started": true})
	case errors.Is(err, syncer.ErrUnknownJob):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "unknown_job"})
	case errors.Is(err, syncer.ErrRunning):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "running"})
	case errors.Is(err, syncer.ErrNotConfigured):
		return c.Status(fiber.StatusPreconditionFailed).JSON(fiber.Map{"error": "not_configured"})
	case errors.Is(err, connections.ErrDualisLocked):
		return c.Status(fiber.StatusLocked).JSON(fiber.Map{"error": "locked"})
	case errors.Is(err, connections.ErrDualisBackoff):
		guard, guardErr := connections.DualisGuard(user.ID)
		if guardErr != nil {
			return fiber.ErrInternalServerError
		}
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "backoff", "next_attempt_at": guard.NextAttemptAt})
	default:
		return fiber.ErrInternalServerError
	}
}

func syncInterval(c fiber.Ctx) error {
	var body intervalBody
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid_body"})
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	err := syncer.SetInterval(user.ID, c.Params("job"), body.Minutes)
	switch {
	case err == nil:
		return c.SendStatus(fiber.StatusNoContent)
	case errors.Is(err, syncer.ErrUnknownJob):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "unknown_job"})
	case errors.Is(err, syncer.ErrInvalidInterval):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":       "invalid_interval",
			"min_minutes": syncer.MinIntervalMinutes,
		})
	default:
		return fiber.ErrInternalServerError
	}
}
