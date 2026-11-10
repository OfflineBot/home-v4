
package routes

import "github.com/gofiber/fiber/v3"


func authRouter(r fiber.Router) {
	r.
		Get("/login", authLogin).
		Get("/register", authRegister)
}


// ===============================================================
// ==================== ROUTES  ==================================
// ===============================================================

func authLogin(c fiber.Ctx) error { return c.SendStatus(200) }
func authRegister(c fiber.Ctx) error { return c.SendStatus(200) }

