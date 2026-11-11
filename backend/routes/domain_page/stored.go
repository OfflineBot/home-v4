package domainpage

import (
	"fmt"
	"io"
	"mime"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"home-v4/backend/services/storage"

	"github.com/gofiber/fiber/v3"
)

const (
	fallbackContentType = "application/octet-stream"
	rangePrefix         = "bytes="
	cacheControl        = "private, max-age=3600"
)

var inlineContentTypes = []string{
	"application/pdf",
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"text/plain",
	"audio/mpeg",
	"video/mp4",
}

type rangedFile struct {
	io.Reader
	io.Closer
}

func sendStored(c fiber.Ctx, name, filename, contentType string) error {
	f, err := storage.Open(name)
	if err != nil {
		return fiber.ErrNotFound
	}

	info, err := f.Stat()
	if err != nil {
		f.Close()
		return fiber.ErrInternalServerError
	}
	size := info.Size()

	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		mediaType = fallbackContentType
	}

	disposition := "attachment"
	if slices.Contains(inlineContentTypes, mediaType) {
		disposition = "inline"
	}
	if header := mime.FormatMediaType(disposition, map[string]string{"filename": filename}); header != "" {
		disposition = header
	}

	etag := fmt.Sprintf(`"%x-%x"`, info.ModTime().UnixNano(), size)

	c.Set(fiber.HeaderContentType, mediaType)
	c.Set(fiber.HeaderContentDisposition, disposition)
	c.Set(fiber.HeaderXContentTypeOptions, "nosniff")
	c.Set(fiber.HeaderAcceptRanges, "bytes")
	c.Set(fiber.HeaderETag, etag)
	c.Set(fiber.HeaderLastModified, info.ModTime().UTC().Format(http.TimeFormat))
	c.Set(fiber.HeaderCacheControl, cacheControl)

	if c.Get(fiber.HeaderIfNoneMatch) == etag {
		f.Close()
		return c.SendStatus(fiber.StatusNotModified)
	}

	start, length, partial, ok := parseRange(c.Get(fiber.HeaderRange), size)
	if !ok {
		f.Close()
		c.Set(fiber.HeaderContentRange, fmt.Sprintf("bytes */%d", size))
		return c.SendStatus(fiber.StatusRequestedRangeNotSatisfiable)
	}
	if !partial {
		return c.SendStream(f, int(size))
	}

	if _, err := f.Seek(start, io.SeekStart); err != nil {
		f.Close()
		return fiber.ErrInternalServerError
	}

	c.Status(fiber.StatusPartialContent)
	c.Set(fiber.HeaderContentRange, fmt.Sprintf("bytes %d-%d/%d", start, start+length-1, size))
	return c.SendStream(rangedFile{Reader: io.LimitReader(f, length), Closer: f}, int(length))
}

func parseRange(header string, size int64) (start, length int64, partial, ok bool) {
	spec, found := strings.CutPrefix(header, rangePrefix)
	if header == "" || !found || strings.Contains(spec, ",") {
		return 0, size, false, true
	}

	from, to, found := strings.Cut(spec, "-")
	if !found {
		return 0, size, false, true
	}

	if from == "" {
		suffix, err := strconv.ParseInt(to, 10, 64)
		if err != nil || suffix <= 0 || size == 0 {
			return 0, 0, false, false
		}
		suffix = min(suffix, size)
		return size - suffix, suffix, true, true
	}

	first, err := strconv.ParseInt(from, 10, 64)
	if err != nil || first < 0 || first >= size {
		return 0, 0, false, false
	}

	last := size - 1
	if to != "" {
		end, err := strconv.ParseInt(to, 10, 64)
		if err != nil || end < first {
			return 0, 0, false, false
		}
		last = min(end, last)
	}

	return first, last - first + 1, true, true
}
