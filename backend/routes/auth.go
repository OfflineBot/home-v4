package routes

import (
	"errors"
	"strings"
	"time"

	"home-v4/backend/services/auth"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/limiter"
)

const (
	bearerPrefix   = "Bearer "
	authRateMax    = 60
	authRateWindow = time.Minute
)

func authRouter(r fiber.Router) {
	r.Use(limiter.New(limiter.Config{
		Max:        authRateMax,
		Expiration: authRateWindow,
	}))

	r.
		Post("/login", authLogin).
		Post("/register", authRegister).
		Post("/logout", authLogout).
		Get("/me", authMe).
		Post("/password", authPassword).
		Post("/2factor/setup", authTwoFactorSetup).
		Post("/2factor/confirm", authTwoFactorConfirm).
		Post("/2factor/disable", authTwoFactorDisable)
}

func authMiddleware(c fiber.Ctx) error {
	token, ok := strings.CutPrefix(c.Get(fiber.HeaderAuthorization), bearerPrefix)
	if !ok || token == "" {
		return fiber.ErrUnauthorized
	}

	user, err := auth.UserByToken(token)
	if err != nil || !user.Approved {
		return fiber.ErrUnauthorized
	}

	fiber.Locals(c, auth.ContextKey, user)
	return c.Next()
}

type credentials struct {
	Name     string `json:"name"`
	Password string `json:"passwordHash"`
	Code     string `json:"code"`
}

type twoFactorCode struct {
	Password string `json:"passwordHash"`
	Code     string `json:"code"`
}

// ===============================================================
// ==================== ROUTES  ==================================
// ===============================================================

func authLogin(c fiber.Ctx) error {
	var body credentials
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.ErrBadRequest
	}

	token, expiresAt, err := auth.Login(body.Name, body.Password, body.Code)
	switch {
	case errors.Is(err, auth.ErrTwoFactorRequired):
		return c.Status(fiber.StatusUnauthorized).
			JSON(fiber.Map{"two_factor_required": true})
	case errors.Is(err, auth.ErrTooManyAttempts):
		return fiber.ErrTooManyRequests
	case errors.Is(err, auth.ErrAccountLocked):
		return fiber.ErrLocked
	case errors.Is(err, auth.ErrNotApproved):
		return c.Status(fiber.StatusForbidden).
			JSON(fiber.Map{"not_approved": true})
	case errors.Is(err, auth.ErrTwoFactorInvalid):
		return c.Status(fiber.StatusUnauthorized).
			JSON(fiber.Map{"two_factor_required": true, "invalid_code": true})
	case errors.Is(err, auth.ErrInvalidCredentials):
		return fiber.ErrUnauthorized
	case err != nil:
		return fiber.ErrInternalServerError
	}

	return c.JSON(fiber.Map{"token": token, "expires_at": expiresAt})
}

func authTwoFactorSetup(c fiber.Ctx) error {
	var body twoFactorCode
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.ErrBadRequest
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	secret, uri, err := auth.TwoFactorSetup(user, body.Password)
	switch {
	case errors.Is(err, auth.ErrInvalidCredentials):
		return fiber.ErrUnauthorized
	case errors.Is(err, auth.ErrTwoFactorConfirmed):
		return fiber.ErrConflict
	case err != nil:
		return fiber.ErrInternalServerError
	}

	return c.JSON(fiber.Map{"secret": secret, "uri": uri})
}

func authTwoFactorConfirm(c fiber.Ctx) error {
	var body twoFactorCode
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.ErrBadRequest
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	switch err := auth.TwoFactorConfirm(user.ID, body.Code); {
	case errors.Is(err, auth.ErrTwoFactorInvalid):
		return fiber.ErrUnauthorized
	case errors.Is(err, auth.ErrTwoFactorMissing):
		return fiber.ErrNotFound
	case errors.Is(err, auth.ErrTwoFactorConfirmed):
		return fiber.ErrConflict
	case err != nil:
		return fiber.ErrInternalServerError
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func authTwoFactorDisable(c fiber.Ctx) error {
	var body twoFactorCode
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.ErrBadRequest
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	switch err := auth.TwoFactorDisable(user, body.Password, body.Code); {
	case errors.Is(err, auth.ErrInvalidCredentials),
		errors.Is(err, auth.ErrTwoFactorInvalid):
		return fiber.ErrUnauthorized
	case errors.Is(err, auth.ErrTwoFactorMissing):
		return fiber.ErrNotFound
	case err != nil:
		return fiber.ErrInternalServerError
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func authRegister(c fiber.Ctx) error {
	var body credentials
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.ErrBadRequest
	}

	switch err := auth.Register(body.Name, body.Password, false); {
	case errors.Is(err, auth.ErrNameTaken):
		return fiber.ErrConflict
	case errors.Is(err, auth.ErrInvalidCredentials),
		errors.Is(err, auth.ErrNotClientHashed):
		return fiber.ErrBadRequest
	case err != nil:
		return fiber.ErrInternalServerError
	}

	return c.SendStatus(fiber.StatusCreated)
}

func authPassword(c fiber.Ctx) error {
	var body struct {
		PasswordHash    string `json:"passwordHash"`
		NewPasswordHash string `json:"newPasswordHash"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.ErrBadRequest
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	switch err := auth.ChangePassword(user, body.PasswordHash, body.NewPasswordHash); {
	case errors.Is(err, auth.ErrInvalidCredentials):
		return fiber.ErrUnauthorized
	case errors.Is(err, auth.ErrNotClientHashed):
		return fiber.ErrBadRequest
	case err != nil:
		return fiber.ErrInternalServerError
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func authMe(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	twoFactor, err := auth.TwoFactorConfirmed(user.ID)
	if err != nil {
		return fiber.ErrInternalServerError
	}

	return c.JSON(fiber.Map{
		"name":       user.Name,
		"is_admin":   user.IsAdmin,
		"two_factor": twoFactor,
	})
}

func authLogout(c fiber.Ctx) error {
	token, ok := strings.CutPrefix(c.Get(fiber.HeaderAuthorization), bearerPrefix)
	if !ok || token == "" {
		return fiber.ErrUnauthorized
	}

	if err := auth.Logout(token); err != nil {
		return fiber.ErrInternalServerError
	}

	return c.SendStatus(fiber.StatusNoContent)
}
