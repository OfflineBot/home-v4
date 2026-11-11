package routes

import (
	"bufio"
	"bytes"
	"errors"
	"io"
	"log/slog"
	"regexp"
	"strings"

	"home-v4/backend/services/domain_page/git"

	"github.com/gofiber/fiber/v3"
)

const apiPrefix = "/api/"

var gitPath = regexp.MustCompile(`^/([^/]+)/([^/]+)\.git(/.*)?$`)

func GitHTTP(c fiber.Ctx) error {
	path := c.Path()
	if strings.HasPrefix(path, apiPrefix) {
		return c.Next()
	}

	match := gitPath.FindStringSubmatch(path)
	if match == nil {
		return c.Next()
	}

	var body io.Reader = c.Request().BodyStream()
	if body == nil {
		body = bytes.NewReader(bytes.Clone(c.Body()))
	}

	resp, err := git.Serve(git.Request{
		Project:         match[1],
		Repo:            match[2],
		Rest:            match[3],
		Method:          c.Method(),
		Query:           string(c.Request().URI().QueryString()),
		Authorization:   c.Get(fiber.HeaderAuthorization),
		ContentType:     c.Get(fiber.HeaderContentType),
		ContentEncoding: c.Get(fiber.HeaderContentEncoding),
		Protocol:        c.Get("Git-Protocol"),
		RemoteAddr:      c.IP(),
		ContentLength:   int64(c.Request().Header.ContentLength()),
		Body:            body,
	})
	switch {
	case errors.Is(err, git.ErrChallenge):
		c.Set(fiber.HeaderWWWAuthenticate, git.Challenge)
		return c.Status(fiber.StatusUnauthorized).SendString("Authentication required\n")
	case errors.Is(err, git.ErrForbidden):
		return c.Status(fiber.StatusForbidden).SendString("Only the project owner can push\n")
	case errors.Is(err, git.ErrUnsupported):
		return c.Status(fiber.StatusForbidden).SendString("Only smart HTTP is supported\n")
	case errors.Is(err, git.ErrNotFound):
		return c.Status(fiber.StatusNotFound).SendString("Repository not found\n")
	case errors.Is(err, git.ErrUnavailable):
		return c.Status(fiber.StatusServiceUnavailable).SendString("Git hosting unavailable\n")
	case err != nil:
		slog.Warn("git: serving failed", "err", err)
		return c.Status(fiber.StatusInternalServerError).SendString("Internal error\n")
	}

	c.Status(resp.Status)
	for key, values := range resp.Header {
		for i, value := range values {
			if i == 0 {
				c.Set(key, value)
				continue
			}
			c.Append(key, value)
		}
	}

	return c.SendStreamWriter(func(w *bufio.Writer) {
		_, copyErr := io.Copy(w, resp.Body)
		if copyErr == nil {
			copyErr = w.Flush()
		}
		resp.Finish(copyErr != nil)
	})
}
