package main

import (
	"fmt"
	"home-v4/backend/routes"
	"home-v4/backend/services"
	"log"
	"os"

	"github.com/gofiber/fiber/v3"
)


func health(c fiber.Ctx) error {
	return c.SendStatus(200)
}


func main() {
	port := os.Getenv("PORT")
	if port == "" {
		fmt.Println("> Running backup port 8080!")
		port = "8080"
	}

	app := fiber.New()

	err := services.Setup()
	if err != nil {
		panic("Setup failed with error: " + err.Error())
	}

	api := app.Group("/api")
	api.Get("/health", health)
	api.Get("/api", routes.CollectRoutes)

	log.Fatal(app.Listen(":" + port))
}

