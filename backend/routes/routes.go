package routes

import "github.com/gofiber/fiber/v3"

// / collects all routs from the router and groups them
func CollectRoutes(r fiber.Router) {
	adminRouter(r.Group("/admin", authMiddleware, adminMiddleware))
	authRouter(r.Group("/auth"))
}
