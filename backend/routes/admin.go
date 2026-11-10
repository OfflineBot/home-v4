package routes

import "github.com/gofiber/fiber/v3"

func adminMiddleware(c fiber.Ctx) error {
	if c.Get("X-Admin-Token") != "secret" {
		return fiber.ErrUnauthorized
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
