package routes

import (
	"slices"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/skip"
)

var publicPaths = []string{
	"/api/health",
	"/api/auth/login",
	"/api/auth/register",
}

// / collects all routs from the router and groups them
func CollectRoutes(r fiber.Router) {
	r.Use(skip.New(authMiddleware, isPublicPath))

	adminRouter(r.Group("/admin", adminMiddleware))
	authRouter(r.Group("/auth"))
}

func isPublicPath(c fiber.Ctx) bool {
	return slices.Contains(publicPaths, strings.TrimSuffix(c.Path(), "/"))
}
