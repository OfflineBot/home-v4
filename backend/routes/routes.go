package routes

import (
	domainpage "home-v4/backend/routes/domain_page"
	"slices"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/skip"
)

var publicPaths = []string{
	"/api/health",
	"/api/auth/login",
	"/api/auth/register",
	domainpage.TerminalConnectPath,
}

// / collects all routs from the router and groups them
func CollectRoutes(r fiber.Router) {
	r.Use(skip.New(authMiddleware, isPublicPath))

	adminRouter(r.Group("/admin", adminMiddleware))
	authRouter(r.Group("/auth"))
	connectionsRouter(r.Group("/connections"))
	syncRouter(r.Group("/sync"))
	domainpage.MachineRouter(r.Group("/machine"))
	domainpage.GradesRouter(r.Group("/grades"))
	domainpage.MoodleRouter(r.Group("/moodle"))
	domainpage.MailRouter(r.Group("/mail"))
	domainpage.CalendarRouter(r.Group("/calendar"))
	domainpage.AutomationRouter(r.Group("/automation"))
	domainpage.LightRouter(r.Group("/lights"))
	integrationRouter(r.Group("/integration"))
}

func isPublicPath(c fiber.Ctx) bool {
	return slices.Contains(publicPaths, strings.TrimSuffix(c.Path(), "/")) || isIntegrationPath(c)
}
