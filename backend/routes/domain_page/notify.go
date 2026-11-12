package domainpage

import (
	"bufio"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"home-v4/backend/services/auth"
	"home-v4/backend/services/domain_page/notify"

	"github.com/gofiber/fiber/v3"
)

const (
	NotifyHookPath = "/api/notify-me"
	streamPing     = 25 * time.Second
)

func NotifyRouter(r fiber.Router) {
	r.
		Get("/list", listNotifications).
		Get("/stream", notificationStream).
		Post("/read", readNotification).
		Post("/read-all", readAllNotifications).
		Post("/delete", deleteNotification).
		Post("/clear", clearNotifications).
		Get("/settings", notifySettings).
		Post("/settings", setNotifySettings).
		Post("/settings/key", rotateNotifyKey).
		Post("/test", testNotification)
}

type hookBody struct {
	notify.Message
	User string `json:"user"`
}

type notifyTarget struct {
	ID int64 `json:"id"`
}

type notifySettingsInput struct {
	HookEnabled *bool `json:"hook_enabled"`
}

func notifyError(c fiber.Ctx, status int, code string) error {
	return c.Status(status).JSON(fiber.Map{"error": code})
}

func notifyUser(c fiber.Ctx) int64 {
	return fiber.Locals[*auth.User](c, auth.ContextKey).ID
}

func listNotifications(c fiber.Ctx) error {
	limit := fiber.Query(c, "limit", 50)

	list, err := notify.List(notifyUser(c), limit)
	if err != nil {
		return notifyError(c, fiber.StatusInternalServerError, "internal")
	}

	unread, err := notify.Unread(notifyUser(c))
	if err != nil {
		return notifyError(c, fiber.StatusInternalServerError, "internal")
	}

	return c.JSON(fiber.Map{"notifications": list, "unread": unread})
}

func notificationStream(c fiber.Ctx) error {
	stream, cancel := notify.Subscribe(notifyUser(c))

	c.Set(fiber.HeaderContentType, "text/event-stream")
	c.Set(fiber.HeaderCacheControl, "no-cache")
	c.Set(fiber.HeaderConnection, "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	return c.SendStreamWriter(func(w *bufio.Writer) {
		defer cancel()

		ticker := time.NewTicker(streamPing)
		defer ticker.Stop()

		if _, err := w.WriteString(": open\n\n"); err != nil {
			return
		}
		if err := w.Flush(); err != nil {
			return
		}

		for {
			var line string

			select {
			case message, ok := <-stream:
				if !ok {
					return
				}
				payload, err := json.Marshal(message)
				if err != nil {
					continue
				}
				line = "data: " + string(payload) + "\n\n"
			case <-ticker.C:
				line = ": ping\n\n"
			}

			if _, err := w.WriteString(line); err != nil {
				return
			}
			if err := w.Flush(); err != nil {
				return
			}
		}
	})
}

func readNotification(c fiber.Ctx) error {
	var body notifyTarget
	if err := c.Bind().JSON(&body); err != nil {
		return notifyError(c, fiber.StatusBadRequest, "invalid_body")
	}

	if err := notify.MarkRead(notifyUser(c), body.ID); err != nil {
		return notifyError(c, fiber.StatusInternalServerError, "internal")
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func readAllNotifications(c fiber.Ctx) error {
	if err := notify.MarkAllRead(notifyUser(c)); err != nil {
		return notifyError(c, fiber.StatusInternalServerError, "internal")
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func deleteNotification(c fiber.Ctx) error {
	var body notifyTarget
	if err := c.Bind().JSON(&body); err != nil {
		return notifyError(c, fiber.StatusBadRequest, "invalid_body")
	}

	if err := notify.Delete(notifyUser(c), body.ID); err != nil {
		return notifyError(c, fiber.StatusInternalServerError, "internal")
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func clearNotifications(c fiber.Ctx) error {
	if err := notify.Clear(notifyUser(c)); err != nil {
		return notifyError(c, fiber.StatusInternalServerError, "internal")
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func notifySettings(c fiber.Ctx) error {
	settings, err := notify.CurrentSettings(notifyUser(c))
	if err != nil {
		return notifyError(c, fiber.StatusInternalServerError, "internal")
	}

	return c.JSON(settings)
}

func setNotifySettings(c fiber.Ctx) error {
	var body notifySettingsInput
	if err := c.Bind().JSON(&body); err != nil || body.HookEnabled == nil {
		return notifyError(c, fiber.StatusBadRequest, "invalid_body")
	}

	if err := notify.SetHookEnabled(notifyUser(c), *body.HookEnabled); err != nil {
		return notifyError(c, fiber.StatusInternalServerError, "internal")
	}

	return notifySettings(c)
}

func rotateNotifyKey(c fiber.Ctx) error {
	if _, err := notify.RotateKey(notifyUser(c)); err != nil {
		return notifyError(c, fiber.StatusInternalServerError, "internal")
	}

	return notifySettings(c)
}

func testNotification(c fiber.Ctx) error {
	message, err := notify.Send(notifyUser(c), notify.Message{
		Title:  "home-v4",
		Body:   "This is what a notification looks like.",
		Source: "app",
	})
	if err != nil {
		return notifyError(c, fiber.StatusInternalServerError, "internal")
	}

	return c.JSON(message)
}

func NotifyHook(c fiber.Ctx) error {
	var body hookBody
	if c.Method() == fiber.MethodPost {
		_ = c.Bind().JSON(&body)
	}

	userID, err := hookTarget(
		firstFilled(c.Query("user"), c.Query("name"), body.User),
		firstFilled(c.Query("key"), c.Get("X-Notify-Key")),
	)
	if err != nil {
		if errors.Is(err, notify.ErrNotFound) || errors.Is(err, notify.ErrHookDisabled) {
			return notifyError(c, fiber.StatusNotFound, "not_found")
		}
		return notifyError(c, fiber.StatusInternalServerError, "internal")
	}

	message := notify.Message{
		Title:  firstFilled(c.Query("title"), body.Title),
		Body:   firstFilled(c.Query("message"), c.Query("body"), c.Query("text"), body.Body),
		Link:   firstFilled(c.Query("link"), body.Link),
		Source: "hook",
	}

	sent, err := notify.Send(userID, message)
	if err != nil {
		if errors.Is(err, notify.ErrInvalidMessage) {
			return notifyError(c, fiber.StatusBadRequest, "title_required")
		}
		return notifyError(c, fiber.StatusInternalServerError, "internal")
	}

	return c.JSON(fiber.Map{"sent": true, "id": sent.ID})
}

func hookTarget(name, key string) (int64, error) {
	if key != "" {
		userID, err := notify.UserByHookKey(key)
		if err != nil || name == "" {
			return userID, err
		}

		owner, err := auth.FindUser(name)
		if err != nil || owner == nil || owner.ID != userID {
			return 0, notify.ErrNotFound
		}

		return userID, nil
	}

	if name == "" {
		return 0, notify.ErrNotFound
	}

	owner, err := auth.FindUser(name)
	if err != nil || owner == nil {
		return 0, notify.ErrNotFound
	}

	enabled, err := notify.HookEnabled(owner.ID)
	if err != nil {
		return 0, err
	}
	if !enabled {
		return 0, notify.ErrHookDisabled
	}

	return owner.ID, nil
}

func firstFilled(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}

	return ""
}
