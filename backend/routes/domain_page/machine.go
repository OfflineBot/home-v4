package domainpage

import (
	"errors"
	"strconv"

	"home-v4/backend/services/auth"
	"home-v4/backend/services/domain_page/machine"

	"github.com/gofiber/contrib/v3/websocket"
	"github.com/gofiber/fiber/v3"
)

const (
	TerminalConnectPath = "/api/machine/terminals/connect"
	terminalReadLimit   = 64 * 1024
)

type terminalKey struct{}

type terminalTarget struct {
	userID    int64
	machineID int64
	size      machine.Size
}

func MachineRouter(r fiber.Router) {
	r.
		Post("/wakeMachine", wakeMachine).
		Get("/status", machineStatus)

	r.Group("/terminals").
		Post("/new", newTerminal).
		Post("/delete", deleteTerminal).
		Get("/list", listTerminals).
		Post("/sessions", listTmuxSessions).
		Post("/ticket", terminalTicket).
		Get("/connect", terminalUpgrade, websocket.New(terminalConnect)).
		Get("/hostkey", terminalHostKey).
		Post("/hostkey/delete", deleteTerminalHostKey)
}

type machineTarget struct {
	ID int64 `json:"id"`
}

type sessionsInput struct {
	ID       int64  `json:"id"`
	Password string `json:"password"`
}

func machineError(c fiber.Ctx, status int, code string) error {
	return c.Status(status).JSON(fiber.Map{"error": code})
}

func machineResult(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, machine.ErrInvalidMachine):
		return machineError(c, fiber.StatusBadRequest, "invalid_machine")
	case errors.Is(err, machine.ErrNotFound):
		return machineError(c, fiber.StatusNotFound, "not_found")
	case errors.Is(err, machine.ErrDuplicate):
		return machineError(c, fiber.StatusConflict, "duplicate")
	case errors.Is(err, machine.ErrWakeFailed):
		return machineError(c, fiber.StatusBadGateway, "wake_failed")
	case errors.Is(err, machine.ErrInvalidTicket):
		return machineError(c, fiber.StatusUnauthorized, "invalid_ticket")
	case errors.Is(err, machine.ErrTooManyTickets), errors.Is(err, machine.ErrBusy):
		return machineError(c, fiber.StatusTooManyRequests, "too_many_requests")
	case errors.Is(err, machine.ErrUnreachable):
		return machineError(c, fiber.StatusBadGateway, "unreachable")
	case errors.Is(err, machine.ErrAuthFailed):
		return machineError(c, fiber.StatusUnauthorized, "auth_failed")
	case errors.Is(err, machine.ErrHostKeyChanged):
		return machineError(c, fiber.StatusConflict, "host_key_changed")
	default:
		return machineError(c, fiber.StatusInternalServerError, "internal")
	}
}

func wakeMachine(c fiber.Ctx) error {
	var body machineTarget
	if err := c.Bind().JSON(&body); err != nil {
		return machineError(c, fiber.StatusBadRequest, "invalid_body")
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)
	if err := machine.Wake(user.ID, body.ID); err != nil {
		return machineResult(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func machineStatus(c fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Query("id"), 10, 64)
	if err != nil {
		return machineError(c, fiber.StatusBadRequest, "invalid_id")
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	status, err := machine.CheckOnline(user.ID, id)
	if err != nil {
		return machineResult(c, err)
	}

	return c.JSON(status)
}

func newTerminal(c fiber.Ctx) error {
	var body machine.Machine
	if err := c.Bind().JSON(&body); err != nil {
		return machineError(c, fiber.StatusBadRequest, "invalid_body")
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	created, err := machine.Create(user.ID, body)
	if err != nil {
		return machineResult(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(created)
}

func deleteTerminal(c fiber.Ctx) error {
	var body machineTarget
	if err := c.Bind().JSON(&body); err != nil {
		return machineError(c, fiber.StatusBadRequest, "invalid_body")
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)
	if err := machine.Delete(user.ID, body.ID); err != nil {
		return machineResult(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func listTerminals(c fiber.Ctx) error {
	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	machines, err := machine.List(user.ID)
	if err != nil {
		return machineResult(c, err)
	}

	return c.JSON(fiber.Map{"machines": machines})
}

func listTmuxSessions(c fiber.Ctx) error {
	var body sessionsInput
	if err := c.Bind().JSON(&body); err != nil {
		return machineError(c, fiber.StatusBadRequest, "invalid_body")
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	list, err := machine.Sessions(user.ID, body.ID, body.Password)
	if err != nil {
		return machineResult(c, err)
	}

	return c.JSON(list)
}

func terminalTicket(c fiber.Ctx) error {
	var body machineTarget
	if err := c.Bind().JSON(&body); err != nil {
		return machineError(c, fiber.StatusBadRequest, "invalid_body")
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	ticket, err := machine.IssueTicket(user.ID, body.ID)
	if err != nil {
		return machineResult(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(ticket)
}

func terminalUpgrade(c fiber.Ctx) error {
	if !websocket.IsWebSocketUpgrade(c) {
		return machineError(c, fiber.StatusUpgradeRequired, "upgrade_required")
	}

	userID, machineID, err := machine.Redeem(c.Query("ticket"))
	if err != nil {
		return machineResult(c, err)
	}

	c.Locals(terminalKey{}, terminalTarget{
		userID:    userID,
		machineID: machineID,
		size:      machine.ParseSize(c.Query("cols"), c.Query("rows")),
	})

	return c.Next()
}

func terminalConnect(conn *websocket.Conn) {
	target, ok := conn.Locals(terminalKey{}).(terminalTarget)
	if !ok {
		conn.Close()
		return
	}

	conn.SetReadLimit(terminalReadLimit)
	machine.RunTerminal(conn, target.userID, target.machineID, target.size)
}

func terminalHostKey(c fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Query("id"), 10, 64)
	if err != nil {
		return machineError(c, fiber.StatusBadRequest, "invalid_id")
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)

	key, err := machine.KnownHostKey(user.ID, id)
	if err != nil {
		return machineResult(c, err)
	}

	return c.JSON(fiber.Map{"known": key != nil, "host_key": key})
}

func deleteTerminalHostKey(c fiber.Ctx) error {
	var body machineTarget
	if err := c.Bind().JSON(&body); err != nil {
		return machineError(c, fiber.StatusBadRequest, "invalid_body")
	}

	user := fiber.Locals[*auth.User](c, auth.ContextKey)
	if err := machine.ForgetHostKey(user.ID, body.ID); err != nil {
		return machineResult(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}
