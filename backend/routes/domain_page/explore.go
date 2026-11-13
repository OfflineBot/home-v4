package domainpage

import (
	"log/slog"

	"home-v4/backend/services/domain_page/explore"

	"github.com/gofiber/fiber/v3"
)

const ExplorePath = "/api/explore"

func ExploreRouter(r fiber.Router) {
	r.Get("/", listExplore)
}

func listExplore(c fiber.Ctx) error {
	listing, err := explore.Load()
	if err != nil {
		slog.Warn("explore: request failed", "err", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal"})
	}

	return c.JSON(listing)
}
