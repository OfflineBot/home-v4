package domainpage

import "github.com/gofiber/fiber/v3"

func GitRouter(r fiber.Router) {
	r.
		Get("/list", listGitRepos).
		Post("/create", createNewRepo)
}

func listGitRepos(c fiber.Ctx) {
	c.SendStatus(200)
}

func createNewRepo(c fiber.Ctx) {
	c.SendStatus(200)
}

