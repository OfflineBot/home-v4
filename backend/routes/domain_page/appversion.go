package domainpage

import (
	"log/slog"

	"home-v4/backend/services/domain_page/appversion"

	"github.com/gofiber/fiber/v3"
)

const AppVersionPath = "/api/app/version"

func AppRouter(r fiber.Router) {
	r.Get("/version", latestAppVersion)
}

func latestAppVersion(c fiber.Ctx) error {
	release, err := appversion.Latest()
	if err != nil {
		slog.Warn("appversion: request failed", "err", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal"})
	}

	return c.JSON(fiber.Map{"release": release})
}
