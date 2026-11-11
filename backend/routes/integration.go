package routes

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"home-v4/backend/services/domain_page/automation"
	"home-v4/backend/services/domain_page/calendar"
	"home-v4/backend/services/domain_page/lights"
	"home-v4/backend/services/domain_page/machine"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/limiter"
)

const (
	integrationPrefix   = "/api/integration/"
	integrationUserKey  = "integration_user"
	integrationRateMax  = 240
	integrationRateSpan = time.Minute
)

func integrationRouter(r fiber.Router) {
	r.Use(integrationAuth, limiter.New(limiter.Config{
		Max:        integrationRateMax,
		Expiration: integrationRateSpan,
		KeyGenerator: func(c fiber.Ctx) string {
			return strconv.FormatInt(integrationUser(c), 10)
		},
		LimitReached: func(c fiber.Ctx) error {
			return integrationError(c, fiber.StatusTooManyRequests, "too_many_requests")
		},
	}))

	r.
		Get("/me", integrationMe).
		Get("/calendar/day", integrationDay).
		Get("/calendar/upcoming", integrationUpcoming).
		Get("/machines", integrationMachines).
		Post("/machines/:id/wake", integrationWake).
		Get("/machines/:id/status", integrationMachineStatus).
		Get("/lights", integrationLights).
		Get("/lights/:id/state", integrationLightState).
		Post("/lights/:id/state", integrationSetLight).
		Get("/lights/:id/presets", integrationPresets)
}

func isIntegrationPath(c fiber.Ctx) bool {
	return strings.HasPrefix(c.Path(), integrationPrefix)
}

func integrationAuth(c fiber.Ctx) error {
	token, ok := strings.CutPrefix(c.Get(fiber.HeaderAuthorization), "Bearer ")
	if !ok {
		return integrationError(c, fiber.StatusUnauthorized, "unauthorized")
	}

	userID, err := automation.UserByToken(strings.TrimSpace(token))
	if err != nil {
		return integrationError(c, fiber.StatusUnauthorized, "unauthorized")
	}

	c.Locals(integrationUserKey, userID)
	return c.Next()
}

func integrationUser(c fiber.Ctx) int64 {
	return fiber.Locals[int64](c, integrationUserKey)
}

func integrationError(c fiber.Ctx, status int, code string) error {
	return c.Status(status).JSON(fiber.Map{"error": code, "message": integrationMessages[code]})
}

var integrationMessages = map[string]string{
	"unauthorized":      "The home-v4 token is not valid",
	"too_many_requests": "Too many requests to home-v4",
	"invalid_query":     "Invalid day or filter",
	"invalid_id":        "Invalid id",
	"invalid_change":    "Invalid light change",
	"not_found":         "Not found in home-v4",
	"unreachable":       "The device is not reachable",
	"wake_failed":       "Wake on LAN failed",
	"internal":          "home-v4 failed",
}

func integrationResult(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, calendar.ErrInvalidDay), errors.Is(err, calendar.ErrInvalidFilter):
		return integrationError(c, fiber.StatusBadRequest, "invalid_query")
	case errors.Is(err, machine.ErrNotFound), errors.Is(err, lights.ErrNotFound):
		return integrationError(c, fiber.StatusNotFound, "not_found")
	case errors.Is(err, lights.ErrInvalidChange):
		return integrationError(c, fiber.StatusBadRequest, "invalid_change")
	case errors.Is(err, lights.ErrUnreachable), errors.Is(err, lights.ErrNotWLED):
		return integrationError(c, fiber.StatusBadGateway, "unreachable")
	case errors.Is(err, machine.ErrWakeFailed):
		return integrationError(c, fiber.StatusBadGateway, "wake_failed")
	}

	return integrationError(c, fiber.StatusInternalServerError, "internal")
}

func integrationID(c fiber.Ctx) (int64, bool) {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	return id, err == nil && id > 0
}

func dayQuery(c fiber.Ctx) calendar.DayQuery {
	flag := func(name string) bool { return c.Query(name) == "true" }

	return calendar.DayQuery{
		Day:       c.Query("day"),
		Source:    c.Query("source"),
		Cancelled: flag("cancelled"),
		Hidden:    flag("hidden"),
		Important: flag("important"),
	}
}

func integrationMe(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"ok": true})
}

func integrationDay(c fiber.Ctx) error {
	summary, err := calendar.Day(integrationUser(c), dayQuery(c), time.Now())
	if err != nil {
		return integrationResult(c, err)
	}

	return c.JSON(summary)
}

func integrationUpcoming(c fiber.Ctx) error {
	event, err := calendar.Upcoming(integrationUser(c), dayQuery(c), time.Now())
	if err != nil {
		return integrationResult(c, err)
	}

	return c.JSON(fiber.Map{"event": event})
}

type integrationMachine struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	IP   string `json:"ip"`
	MAC  string `json:"mac"`
}

func integrationMachines(c fiber.Ctx) error {
	list, err := machine.List(integrationUser(c))
	if err != nil {
		return integrationResult(c, err)
	}

	machines := make([]integrationMachine, 0, len(list))
	for _, m := range list {
		machines = append(machines, integrationMachine{ID: m.ID, Name: m.Name, IP: m.IP, MAC: m.MAC})
	}

	return c.JSON(fiber.Map{"machines": machines})
}

func integrationWake(c fiber.Ctx) error {
	id, ok := integrationID(c)
	if !ok {
		return integrationError(c, fiber.StatusBadRequest, "invalid_id")
	}

	if err := machine.Wake(integrationUser(c), id); err != nil {
		return integrationResult(c, err)
	}

	return c.JSON(fiber.Map{"id": id, "woken": true})
}

func integrationMachineStatus(c fiber.Ctx) error {
	id, ok := integrationID(c)
	if !ok {
		return integrationError(c, fiber.StatusBadRequest, "invalid_id")
	}

	status, err := machine.CheckOnline(integrationUser(c), id)
	if err != nil {
		return integrationResult(c, err)
	}

	return c.JSON(status)
}

func integrationLights(c fiber.Ctx) error {
	list, err := lights.List(integrationUser(c))
	if err != nil {
		return integrationResult(c, err)
	}

	return c.JSON(fiber.Map{"lights": list})
}

func integrationLightState(c fiber.Ctx) error {
	id, ok := integrationID(c)
	if !ok {
		return integrationError(c, fiber.StatusBadRequest, "invalid_id")
	}

	state, err := lights.CurrentState(integrationUser(c), id)
	if err != nil {
		return integrationResult(c, err)
	}

	return c.JSON(state)
}

func integrationSetLight(c fiber.Ctx) error {
	id, ok := integrationID(c)
	if !ok {
		return integrationError(c, fiber.StatusBadRequest, "invalid_id")
	}

	var change lights.Change
	if err := c.Bind().JSON(&change); err != nil {
		return integrationError(c, fiber.StatusBadRequest, "invalid_change")
	}

	state, err := lights.SetState(integrationUser(c), id, change)
	if err != nil {
		return integrationResult(c, err)
	}

	return c.JSON(state)
}

func integrationPresets(c fiber.Ctx) error {
	id, ok := integrationID(c)
	if !ok {
		return integrationError(c, fiber.StatusBadRequest, "invalid_id")
	}

	presets, err := lights.Presets(integrationUser(c), id)
	if err != nil {
		return integrationResult(c, err)
	}

	return c.JSON(fiber.Map{"presets": presets})
}
