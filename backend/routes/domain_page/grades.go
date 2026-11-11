package domainpage

import (
	"home-v4/backend/services/auth"
	"home-v4/backend/services/domain_page/grades"

	"github.com/gofiber/fiber/v3"
)

func GradesRouter(r fiber.Router) {
	r.Get("/list", listGrades)
}

func listGrades(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	list, err := grades.ByUser(user.ID)
	if err != nil {
		return fiber.ErrInternalServerError
	}

	return c.JSON(fiber.Map{"semesters": grades.Semesters(list)})
}
