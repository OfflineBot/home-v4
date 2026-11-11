package domainpage

import (
	"errors"
	"log/slog"
	"strconv"
	"time"

	"home-v4/backend/services/auth"
	"home-v4/backend/services/domain_page/automation"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/limiter"
)

const (
	automationRunMax    = 20
	automationRunWindow = time.Minute
)

func AutomationRouter(r fiber.Router) {
	runLimit := limiter.New(limiter.Config{
		Max:        automationRunMax,
		Expiration: automationRunWindow,
		KeyGenerator: func(c fiber.Ctx) string {
			return strconv.FormatInt(fiber.Locals[*auth.User](c, auth.ContextKey).ID, 10)
		},
		LimitReached: func(c fiber.Ctx) error {
			return automationError(c, fiber.StatusTooManyRequests, "too_many_attempts")
		},
	})

	r.
		Get("/status", automationStatus).
		Get("/nodes", automationNodes).
		Get("/nodes/detail", automationNodeDetail).
		Get("/icons/*", automationIcon).
		Get("/credential-types", automationCredentialTypes).
		Get("/credential-types/detail", automationCredentialType)

	r.Group("/credentials").
		Get("/", automationCredentials).
		Post("/", automationCreateCredential).
		Post("/:id", automationUpdateCredential).
		Post("/:id/test", runLimit, automationTestCredential).
		Post("/:id/delete", automationDeleteCredential)

	r.Group("/workflows").
		Get("/", automationWorkflows).
		Post("/", automationCreateWorkflow).
		Get("/:id", automationWorkflow).
		Post("/:id", automationUpdateWorkflow).
		Post("/:id/activate", automationActivate).
		Post("/:id/deactivate", automationDeactivate).
		Post("/:id/delete", automationDeleteWorkflow).
		Post("/:id/run", runLimit, automationRun).
		Get("/:id/executions", automationExecutions)

	r.Get("/executions/:id", automationExecution)
	r.Get("/home/options", automationHomeOptions)
}

func automationHomeOptions(c fiber.Ctx) error {
	options, err := automation.HomeOptions(automationActor(c).ID, c.Query("method"), map[string]string{
		"light": c.Query("light"),
	})
	if errors.Is(err, automation.ErrUnknownMethod) {
		return automationError(c, fiber.StatusNotFound, "not_found")
	}
	if err != nil {
		return automationError(c, fiber.StatusBadGateway, "upstream_failed")
	}

	return c.JSON(fiber.Map{"options": options})
}

func automationActor(c fiber.Ctx) automation.Actor {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)
	return automation.Actor{ID: user.ID, Admin: user.IsAdmin}
}

func automationError(c fiber.Ctx, status int, code string) error {
	return c.Status(status).JSON(fiber.Map{"error": code})
}

func automationResult(c fiber.Ctx, err error) error {
	var validation *automation.ValidationError
	var rejected *automation.RejectedError
	var inUse *automation.InUseError

	switch {
	case errors.As(err, &validation):
		status := fiber.StatusBadRequest
		if validation.Code == "blocked_node" {
			status = fiber.StatusForbidden
		}
		return c.Status(status).JSON(fiber.Map{
			"error": validation.Code,
			"field": optionalText(validation.Field),
			"node":  optionalText(validation.Node),
		})
	case errors.As(err, &rejected):
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": "rejected", "message": rejected.Message})
	case errors.As(err, &inUse):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "credential_in_use", "workflows": inUse.Workflows})
	case errors.Is(err, automation.ErrDisabled):
		return automationError(c, fiber.StatusServiceUnavailable, "disabled")
	case errors.Is(err, automation.ErrUnavailable):
		return automationError(c, fiber.StatusServiceUnavailable, "unavailable")
	case errors.Is(err, automation.ErrNotFound):
		return automationError(c, fiber.StatusNotFound, "not_found")
	case errors.Is(err, automation.ErrLimitReached):
		return automationError(c, fiber.StatusConflict, "limit_reached")
	case errors.Is(err, automation.ErrNotActive):
		return automationError(c, fiber.StatusConflict, "not_active")
	case errors.Is(err, automation.ErrNoWebhook):
		return automationError(c, fiber.StatusConflict, "no_webhook")
	case errors.Is(err, automation.ErrDynamicPath):
		return automationError(c, fiber.StatusConflict, "dynamic_path")
	case errors.Is(err, automation.ErrUpstream):
		return automationError(c, fiber.StatusBadGateway, "upstream_failed")
	}

	slog.Error("automation: request failed", "path", c.Path(), "err", err)
	return automationError(c, fiber.StatusInternalServerError, "internal")
}

func optionalText(value string) *string {
	if value == "" {
		return nil
	}

	return &value
}

func automationStatus(c fiber.Ctx) error {
	return c.JSON(automation.CurrentStatus())
}

func automationNodes(c fiber.Ctx) error {
	nodes, err := automation.Nodes(automationActor(c))
	if err != nil {
		return automationResult(c, err)
	}

	return c.JSON(fiber.Map{"nodes": nodes})
}

func automationNodeDetail(c fiber.Ctx) error {
	var version *float64
	if raw := c.Query("version"); raw != "" {
		parsed, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			return automationError(c, fiber.StatusBadRequest, "invalid_query")
		}
		version = &parsed
	}

	detail, err := automation.NodeDetail(automationActor(c), c.Query("type"), version)
	if err != nil {
		return automationResult(c, err)
	}

	c.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSONCharsetUTF8)
	return c.Send(detail)
}

func automationIcon(c fiber.Ctx) error {
	icon, err := automation.NodeIcon(c.Params("*"))
	if err != nil {
		return automationResult(c, err)
	}

	c.Set(fiber.HeaderContentType, icon.ContentType)
	c.Set(fiber.HeaderCacheControl, "private, max-age=86400")
	c.Set(fiber.HeaderXContentTypeOptions, "nosniff")
	c.Set(fiber.HeaderContentSecurityPolicy, "default-src 'none'; style-src 'unsafe-inline'; sandbox")

	return c.Send(icon.Data)
}

func automationCredentialTypes(c fiber.Ctx) error {
	types, err := automation.CredentialTypes(automationActor(c))
	if err != nil {
		return automationResult(c, err)
	}

	return c.JSON(fiber.Map{"types": types})
}

func automationCredentialType(c fiber.Ctx) error {
	detail, err := automation.CredentialType(automationActor(c), c.Query("type"))
	if err != nil {
		return automationResult(c, err)
	}

	return c.JSON(detail)
}

func automationCredentials(c fiber.Ctx) error {
	creds, err := automation.Credentials(automationActor(c).ID)
	if err != nil {
		return automationResult(c, err)
	}

	return c.JSON(fiber.Map{"credentials": creds})
}

func automationCreateCredential(c fiber.Ctx) error {
	var body automation.CredentialInput
	if err := c.Bind().JSON(&body); err != nil {
		return automationError(c, fiber.StatusBadRequest, "invalid_body")
	}

	cred, err := automation.CreateCredential(automationActor(c), body)
	if err != nil {
		return automationResult(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(cred)
}

func automationUpdateCredential(c fiber.Ctx) error {
	var body automation.CredentialUpdate
	if err := c.Bind().JSON(&body); err != nil {
		return automationError(c, fiber.StatusBadRequest, "invalid_body")
	}

	cred, err := automation.UpdateCredential(automationActor(c).ID, c.Params("id"), body)
	if err != nil {
		return automationResult(c, err)
	}

	return c.JSON(cred)
}

func automationDeleteCredential(c fiber.Ctx) error {
	if err := automation.DeleteCredential(automationActor(c).ID, c.Params("id")); err != nil {
		return automationResult(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func automationTestCredential(c fiber.Ctx) error {
	result, err := automation.TestCredential(automationActor(c).ID, c.Params("id"))
	if err != nil {
		return automationResult(c, err)
	}

	return c.JSON(result)
}

func automationRun(c fiber.Ctx) error {
	result, err := automation.RunWorkflow(automationActor(c).ID, c.Params("id"), c.Body())
	if err != nil {
		return automationResult(c, err)
	}

	return c.JSON(result)
}

func automationWorkflows(c fiber.Ctx) error {
	list, err := automation.Workflows(automationActor(c).ID)
	if err != nil {
		return automationResult(c, err)
	}

	return c.JSON(fiber.Map{"workflows": list})
}

func automationWorkflow(c fiber.Ctx) error {
	wf, err := automation.WorkflowByID(automationActor(c).ID, c.Params("id"))
	if err != nil {
		return automationResult(c, err)
	}

	return c.JSON(wf)
}

func automationCreateWorkflow(c fiber.Ctx) error {
	var body automation.WorkflowInput
	if err := c.Bind().JSON(&body); err != nil {
		return automationError(c, fiber.StatusBadRequest, "invalid_body")
	}

	wf, err := automation.CreateWorkflow(automationActor(c), body)
	if err != nil {
		return automationResult(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(wf)
}

func automationUpdateWorkflow(c fiber.Ctx) error {
	var body automation.WorkflowInput
	if err := c.Bind().JSON(&body); err != nil {
		return automationError(c, fiber.StatusBadRequest, "invalid_body")
	}

	wf, err := automation.UpdateWorkflow(automationActor(c), c.Params("id"), body)
	if err != nil {
		return automationResult(c, err)
	}

	return c.JSON(wf)
}

func automationActivate(c fiber.Ctx) error {
	wf, err := automation.ActivateWorkflow(automationActor(c), c.Params("id"))
	if err != nil {
		return automationResult(c, err)
	}

	return c.JSON(wf)
}

func automationDeactivate(c fiber.Ctx) error {
	wf, err := automation.DeactivateWorkflow(automationActor(c).ID, c.Params("id"))
	if err != nil {
		return automationResult(c, err)
	}

	return c.JSON(wf)
}

func automationDeleteWorkflow(c fiber.Ctx) error {
	if err := automation.DeleteWorkflow(automationActor(c).ID, c.Params("id")); err != nil {
		return automationResult(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func automationExecutions(c fiber.Ctx) error {
	limit := 0
	if raw := c.Query("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 {
			return automationError(c, fiber.StatusBadRequest, "invalid_query")
		}
		limit = parsed
	}

	page, err := automation.Executions(automationActor(c).ID, c.Params("id"), automation.ExecutionQuery{
		Status: c.Query("status"),
		Cursor: c.Query("cursor"),
		Limit:  limit,
	})
	if err != nil {
		return automationResult(c, err)
	}

	return c.JSON(page)
}

func automationExecution(c fiber.Ctx) error {
	exec, err := automation.ExecutionByID(automationActor(c).ID, c.Params("id"))
	if err != nil {
		return automationResult(c, err)
	}

	return c.JSON(exec)
}
