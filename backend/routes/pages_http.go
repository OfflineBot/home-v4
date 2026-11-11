package routes

import (
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"

	"home-v4/backend/services/domain_page/pages"

	"github.com/gofiber/fiber/v3"
)

const pagesLabel = "pages."

func PagesHTTP(c fiber.Ctx) error {
	if !isPagesHost(c.Host()) {
		return c.Next()
	}

	c.Set(fiber.HeaderXContentTypeOptions, "nosniff")
	c.Set(fiber.HeaderReferrerPolicy, "strict-origin-when-cross-origin")

	if c.Method() != fiber.MethodGet && c.Method() != fiber.MethodHead {
		c.Set(fiber.HeaderAllow, "GET, HEAD")
		return c.Status(fiber.StatusMethodNotAllowed).SendString("Method not allowed\n")
	}

	trimmed := strings.TrimPrefix(c.Path(), "/")
	name, rest, hasSlash := strings.Cut(trimmed, "/")
	if name == "" {
		return c.Status(fiber.StatusNotFound).SendString("Page not found\n")
	}
	if !hasSlash {
		target := "/" + name + "/"
		if query := string(c.Request().URI().QueryString()); query != "" {
			target += "?" + query
		}
		return c.Redirect().Status(fiber.StatusMovedPermanently).To(target)
	}

	asset, err := pages.Resolve(name, rest)
	switch {
	case errors.Is(err, pages.ErrNotFound):
		return c.Status(fiber.StatusNotFound).SendString("Page not found\n")
	case err != nil:
		slog.Warn("pages: serving failed", "page", name, "err", err)
		return c.Status(fiber.StatusInternalServerError).SendString("Internal error\n")
	}

	if asset.Redirect != "" {
		return c.Redirect().Status(fiber.StatusMovedPermanently).To(asset.Redirect)
	}

	c.Set(fiber.HeaderContentType, asset.ContentType)
	c.Set(fiber.HeaderCacheControl, "no-cache")
	c.Set(fiber.HeaderETag, asset.ETag)
	if !asset.Modified.IsZero() {
		c.Set(fiber.HeaderLastModified, asset.Modified.UTC().Format(http.TimeFormat))
	}

	if asset.Status == fiber.StatusOK && c.Get(fiber.HeaderIfNoneMatch) == asset.ETag {
		asset.Body.Close()
		return c.SendStatus(fiber.StatusNotModified)
	}

	c.Status(asset.Status)
	if c.Method() == fiber.MethodHead {
		asset.Body.Close()
		c.Set(fiber.HeaderContentLength, strconv.FormatInt(asset.Size, 10))
		return nil
	}

	return c.SendStream(asset.Body, int(asset.Size))
}

func isPagesHost(host string) bool {
	if name, _, err := net.SplitHostPort(host); err == nil {
		host = name
	}

	return strings.HasPrefix(strings.ToLower(host), pagesLabel)
}
