package routes

import (
	"errors"

	"home-v4/backend/services/auth"

	"github.com/gofiber/fiber/v3"
)

func adminMiddleware(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)
	if user == nil || !user.IsAdmin {
		return fiber.ErrForbidden
	}
	return c.Next()
}

func adminRouter(r fiber.Router) {
	r.Get("/", adminDashboard)

	r.Group("/users").
		Get("/", adminUserList).
		Post("/approve", adminApprove).
		Post("/revoke", adminRevoke).
		Post("/unlock", adminUnlock).
		Post("/role", adminRole).
		Post("/2factor/reset", adminResetTwoFactor).
		Post("/delete", adminDeleteUser)
}

type userTarget struct {
	Name    string `json:"name"`
	IsAdmin bool   `json:"is_admin"`
}

func targetName(c fiber.Ctx) (*auth.User, string, error) {
	var body userTarget
	if err := c.Bind().JSON(&body); err != nil {
		return nil, "", fiber.ErrBadRequest
	}

	return fiber.Locals[*auth.User](c, auth.ContextKey), body.Name, nil
}

func adminResult(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, auth.ErrUnknownUser):
		return fiber.ErrNotFound
	case errors.Is(err, auth.ErrSelfTarget):
		return fiber.ErrForbidden
	case errors.Is(err, auth.ErrLastAdmin):
		return fiber.ErrConflict
	case errors.Is(err, auth.ErrNoChange):
		return fiber.ErrConflict
	case err != nil:
		return fiber.ErrInternalServerError
	}

	return c.SendStatus(fiber.StatusNoContent)
}

// ===============================================================
// ==================== ROUTES  ==================================
// ===============================================================

func adminDashboard(c fiber.Ctx) error { return c.SendStatus(200) }

func adminUserList(c fiber.Ctx) error {
	users, err := auth.ListUsers()
	if err != nil {
		return fiber.ErrInternalServerError
	}

	return c.JSON(fiber.Map{"users": users})
}

func adminApprove(c fiber.Ctx) error {
	_, name, err := targetName(c)
	if err != nil {
		return err
	}

	return adminResult(c, auth.Approve(name))
}

func adminRevoke(c fiber.Ctx) error {
	actor, name, err := targetName(c)
	if err != nil {
		return err
	}

	return adminResult(c, auth.RevokeApproval(actor, name))
}

func adminUnlock(c fiber.Ctx) error {
	_, name, err := targetName(c)
	if err != nil {
		return err
	}

	return adminResult(c, auth.Unlock(name))
}

func adminRole(c fiber.Ctx) error {
	var body userTarget
	if err := c.Bind().JSON(&body); err != nil {
		return fiber.ErrBadRequest
	}

	actor := fiber.Locals[*auth.User](c, auth.ContextKey)
	return adminResult(c, auth.SetAdmin(actor, body.Name, body.IsAdmin))
}

func adminResetTwoFactor(c fiber.Ctx) error {
	actor, name, err := targetName(c)
	if err != nil {
		return err
	}

	return adminResult(c, auth.ResetTwoFactor(actor, name))
}

func adminDeleteUser(c fiber.Ctx) error {
	actor, name, err := targetName(c)
	if err != nil {
		return err
	}

	return adminResult(c, auth.DeleteUser(actor, name))
}
