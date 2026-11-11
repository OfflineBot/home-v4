package routes

import (
	domainpage "home-v4/backend/routes/domain_page"
	"io"
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
	r.Use(bufferBody)
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
	domainpage.FilesRouter(r.Group("/files"))
	domainpage.GitRouter(r.Group("/git"))
	domainpage.PagesRouter(r.Group("/pages"))
	integrationRouter(r.Group("/integration"))
}

func bufferBody(c fiber.Ctx) error {
	req := c.Request()
	if !req.IsBodyStream() || c.Path() == domainpage.FilesUploadPath {
		return c.Next()
	}

	data, err := io.ReadAll(io.LimitReader(req.BodyStream(), fiber.DefaultBodyLimit+1))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid_body"})
	}
	if len(data) > fiber.DefaultBodyLimit {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{"error": "body_too_large"})
	}

	req.SetBody(data)
	return c.Next()
}

func isPublicPath(c fiber.Ctx) bool {
	return slices.Contains(publicPaths, strings.TrimSuffix(c.Path(), "/")) || isIntegrationPath(c)
}
