package routes

import (
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
)

func TestCalendarAndSleepRoutesAreRegistered(t *testing.T) {
	app := fiber.New()
	CollectRoutes(app.Group("/api"))

	paths := map[string]bool{}
	for _, route := range app.GetRoutes() {
		paths[route.Method+" "+route.Path] = true
	}

	for _, want := range []string{
		"GET /api/integration/calendar/series",
		"POST /api/calendar/events/:id/delete",
		"POST /api/lights/sleep/cancel",
	} {
		if !paths[want] {
			t.Errorf("%s is not registered; have %s", want, strings.Join(keys(paths), ", "))
		}
	}
}

func keys(set map[string]bool) []string {
	list := make([]string, 0, len(set))
	for key := range set {
		list = append(list, key)
	}
	return list
}
