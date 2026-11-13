package routes

import (
	domainpage "home-v4/backend/routes/domain_page"
	"io"
	"slices"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/limiter"
	"github.com/gofiber/fiber/v3/middleware/skip"
)

var publicPaths = []string{
	"/api/health",
	"/api/auth/login",
	"/api/auth/register",
	domainpage.TerminalConnectPath,
	domainpage.NotifyHookPath,
	domainpage.ExplorePath,
	domainpage.AppVersionPath,
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
	domainpage.NotifyRouter(r.Group("/notifications"))
	domainpage.PublicStoreRouter(r.Group("/public"))
	domainpage.ExploreRouter(r.Group("/explore"))
	domainpage.AppRouter(r.Group("/app"))
	integrationRouter(r.Group("/integration"))

	// the hook carries its key in the URL, so it is rate limited by itself
	r.Add([]string{fiber.MethodGet, fiber.MethodPost}, "/notify-me", limiter.New(limiter.Config{
		Max:        hookRateMax,
		Expiration: time.Minute,
		KeyGenerator: func(c fiber.Ctx) string {
			return c.IP() + ":" + c.Query("user")
		},
		LimitReached: func(c fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "too_many_requests"})
		},
	}), domainpage.NotifyHook)
}

const hookRateMax = 60

func bufferBody(c fiber.Ctx) error {
	req := c.Request()
	if !req.IsBodyStream() || c.Path() == domainpage.FilesUploadPath ||
		c.Path() == domainpage.PublicUploadPath {
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
	return slices.Contains(publicPaths, strings.TrimSuffix(c.Path(), "/")) ||
		isIntegrationPath(c) || domainpage.IsPublicStorePath(c)
}
