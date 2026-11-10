package routes

import (
	"home-v4/backend/services/auth"

	"github.com/gofiber/fiber/v3"
)

func adminMiddleware(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, userKey)
	if user == nil || !user.IsAdmin {
		return fiber.ErrForbidden
	}
	return c.Next()
}

func adminRouter(r fiber.Router) {
	r.Get("/", adminDashboard)
}

// ===============================================================
// ==================== ROUTES  ==================================
// ===============================================================

func adminDashboard(c fiber.Ctx) error { return c.SendStatus(200) }
