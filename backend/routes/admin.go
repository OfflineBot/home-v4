package routes

import (
	"errors"

	"home-v4/backend/services/admin"
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
		Get("/detail", adminUserDetail).
		Post("/create", adminCreateUser).
		Post("/approve", adminApprove).
		Post("/revoke", adminRevoke).
		Post("/unlock", adminUnlock).
		Post("/role", adminRole).
		Post("/password", adminSetPassword).
		Post("/sessions/delete", adminDeleteSessions).
		Post("/2factor/reset", adminResetTwoFactor).
		Post("/dualis/reset", adminDualisReset).
		Post("/delete", adminDeleteUser)
}

type userTarget struct {
	Name    string `json:"name"`
	IsAdmin bool   `json:"is_admin"`
}

type userPassword struct {
	Name         string `json:"name"`
	PasswordHash string `json:"passwordHash"`
	IsAdmin      bool   `json:"is_admin"`
}

func targetName(c fiber.Ctx) (*auth.User, string, error) {
	var body userTarget
	if err := c.Bind().JSON(&body); err != nil {
		return nil, "", errInvalidBody
	}

	return fiber.Locals[*auth.User](c, auth.ContextKey), body.Name, nil
}

var errInvalidBody = errors.New("invalid request body")

func adminError(c fiber.Ctx, status int, code string) error {
	return c.Status(status).JSON(fiber.Map{"error": code})
}

func adminFailure(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, errInvalidBody):
		return adminError(c, fiber.StatusBadRequest, "invalid_body")
	case errors.Is(err, auth.ErrUnknownUser):
		return adminError(c, fiber.StatusNotFound, "unknown_user")
	case errors.Is(err, auth.ErrSelfTarget):
		return adminError(c, fiber.StatusForbidden, "self_target")
	case errors.Is(err, auth.ErrLastAdmin):
		return adminError(c, fiber.StatusConflict, "last_admin")
	case errors.Is(err, auth.ErrNoChange):
		return adminError(c, fiber.StatusConflict, "no_change")
	case errors.Is(err, auth.ErrNameTaken):
		return adminError(c, fiber.StatusConflict, "name_taken")
	case errors.Is(err, auth.ErrInvalidCredentials):
		return adminError(c, fiber.StatusBadRequest, "invalid_name")
	case errors.Is(err, auth.ErrNotClientHashed):
		return adminError(c, fiber.StatusBadRequest, "invalid_password")
	default:
		return adminError(c, fiber.StatusInternalServerError, "internal")
	}
}

func adminResult(c fiber.Ctx, err error) error {
	if err != nil {
		return adminFailure(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

// ===============================================================
// ==================== ROUTES  ==================================
// ===============================================================

func adminDashboard(c fiber.Ctx) error {
	overview, err := admin.GetOverview()
	if err != nil {
		return adminFailure(c, err)
	}

	return c.JSON(overview)
}

func adminUserDetail(c fiber.Ctx) error {
	detail, err := admin.Detail(c.Query("name"))
	if err != nil {
		return adminFailure(c, err)
	}

	return c.JSON(detail)
}

func adminCreateUser(c fiber.Ctx) error {
	var body userPassword
	if err := c.Bind().JSON(&body); err != nil {
		return adminError(c, fiber.StatusBadRequest, "invalid_body")
	}

	return adminResult(c, auth.CreateUser(body.Name, body.PasswordHash, body.IsAdmin))
}

func adminSetPassword(c fiber.Ctx) error {
	var body userPassword
	if err := c.Bind().JSON(&body); err != nil {
		return adminError(c, fiber.StatusBadRequest, "invalid_body")
	}

	actor := fiber.Locals[*auth.User](c, auth.ContextKey)
	return adminResult(c, auth.SetPassword(actor, body.Name, body.PasswordHash))
}

func adminDeleteSessions(c fiber.Ctx) error {
	actor, name, err := targetName(c)
	if err != nil {
		return adminFailure(c, err)
	}

	return adminResult(c, auth.RevokeSessions(actor, name))
}

func adminDualisReset(c fiber.Ctx) error {
	_, name, err := targetName(c)
	if err != nil {
		return adminFailure(c, err)
	}

	return adminResult(c, admin.ResetDualis(name))
}

func adminUserList(c fiber.Ctx) error {
	users, err := auth.ListUsers()
	if err != nil {
		return adminFailure(c, err)
	}

	return c.JSON(fiber.Map{"users": users})
}

func adminApprove(c fiber.Ctx) error {
	_, name, err := targetName(c)
	if err != nil {
		return adminFailure(c, err)
	}

	return adminResult(c, auth.Approve(name))
}

func adminRevoke(c fiber.Ctx) error {
	actor, name, err := targetName(c)
	if err != nil {
		return adminFailure(c, err)
	}

	return adminResult(c, auth.RevokeApproval(actor, name))
}

func adminUnlock(c fiber.Ctx) error {
	_, name, err := targetName(c)
	if err != nil {
		return adminFailure(c, err)
	}

	return adminResult(c, auth.Unlock(name))
}

func adminRole(c fiber.Ctx) error {
	var body userTarget
	if err := c.Bind().JSON(&body); err != nil {
		return adminError(c, fiber.StatusBadRequest, "invalid_body")
	}

	actor := fiber.Locals[*auth.User](c, auth.ContextKey)
	return adminResult(c, auth.SetAdmin(actor, body.Name, body.IsAdmin))
}

func adminResetTwoFactor(c fiber.Ctx) error {
	actor, name, err := targetName(c)
	if err != nil {
		return adminFailure(c, err)
	}

	return adminResult(c, auth.ResetTwoFactor(actor, name))
}

func adminDeleteUser(c fiber.Ctx) error {
	actor, name, err := targetName(c)
	if err != nil {
		return adminFailure(c, err)
	}

	return adminResult(c, auth.DeleteUser(actor, name))
}
