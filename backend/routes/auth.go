package routes

import (
	"errors"
	"strings"

	"home-v4/backend/services/auth"

	"github.com/gofiber/fiber/v3"
)

const (
	userKey      = "user"
	bearerPrefix = "Bearer "
)

func authRouter(r fiber.Router) {
	r.
		Post("/login", authLogin).
		Post("/logout", authLogout)

	r.Group("", authMiddleware, adminMiddleware).
		Post("/register", authRegister)
}

func authMiddleware(c fiber.Ctx) error {
	token, ok := strings.CutPrefix(c.Get(fiber.HeaderAuthorization), bearerPrefix)
	if !ok || token == "" {
		return fiber.ErrUnauthorized
	}

	user, err := auth.UserByToken(token)
	if err != nil {
		return fiber.ErrUnauthorized
	}

	fiber.Locals(c, userKey, user)
	return c.Next()
}

type credentials struct {
	Name     string `json:"name"`
	Password string `json:"password"`
}

// ===============================================================
// ==================== ROUTES  ==================================
// ===============================================================

func authLogin(c fiber.Ctx) error {
	var body credentials
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.ErrBadRequest
	}

	token, expiresAt, err := auth.Login(body.Name, body.Password)
	if err != nil {
		if errors.Is(err, auth.ErrInvalidCredentials) {
			return fiber.ErrUnauthorized
		}
		return err
	}

	return c.JSON(fiber.Map{"token": token, "expires_at": expiresAt})
}

func authRegister(c fiber.Ctx) error {
	var body credentials
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.ErrBadRequest
	}

	switch err := auth.Register(body.Name, body.Password, false); {
	case errors.Is(err, auth.ErrNameTaken):
		return fiber.ErrConflict
	case errors.Is(err, auth.ErrInvalidCredentials):
		return fiber.ErrBadRequest
	case err != nil:
		return err
	}

	return c.SendStatus(fiber.StatusCreated)
}

func authLogout(c fiber.Ctx) error {
	token, ok := strings.CutPrefix(c.Get(fiber.HeaderAuthorization), bearerPrefix)
	if !ok || token == "" {
		return fiber.ErrUnauthorized
	}

	if err := auth.Logout(token); err != nil {
		return err
	}

	return c.SendStatus(fiber.StatusNoContent)
}
