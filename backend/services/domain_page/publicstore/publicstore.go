package publicstore

import (
	"crypto/rand"
	_ "embed"
	"encoding/hex"
	"errors"
	"io"
	"mime"
	"os"
	"path"
	"strings"
	"time"
	"unicode/utf8"

	"home-v4/backend/services/db"
	"home-v4/backend/services/storage"
)

//go:embed schema.sql
var Schema string

const (
	area        = "public"
	maxName     = 120
	maxFileSize = 512 * 1024 * 1024
	maxTotal    = 8 * 1024 * 1024 * 1024
	maxFiles    = 500
	idBytes     = 8
	keyBytes    = 16
)

var (
	ErrInvalidName = errors.New("invalid file name")
	ErrNotFound    = errors.New("not found")
	ErrClosed      = errors.New("uploads closed")
	ErrTooLarge    = errors.New("file too large")
	ErrFull        = errors.New("store full")
)

type File struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Size        int64  `json:"size"`
	ContentType string `json:"content_type"`
	Uploader    string `json:"uploader"`
	CreatedAt   string `json:"created_at"`
	Downloads   int64  `json:"downloads"`
}

type Settings struct {
	UploadsOpen bool   `json:"uploads_open"`
	UploadKey   string `json:"upload_key"`
}

type Usage struct {
	Files int64 `json:"files"`
	Bytes int64 `json:"bytes"`
	Limit int64 `json:"limit"`
}

func cleanName(raw string) string {
	name := path.Base(strings.TrimSpace(strings.ReplaceAll(raw, "\\", "/")))
	name = strings.Map(func(r rune) rune {
		if r < 0x20 || r == '/' || r == 0x7f {
			return -1
		}
		return r
	}, name)

	if name == "." || name == ".." {
		return ""
	}
	if utf8.RuneCountInString(name) > maxName {
		runes := []rune(name)
		name = string(runes[len(runes)-maxName:])
	}

	return name
}

func List() ([]File, error) {
	rows, err := db.DB.Query(
		`SELECT id, name, size, content_type, uploader, created_at, downloads
			FROM public_files ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	files := []File{}
	for rows.Next() {
		var file File
		if err := rows.Scan(&file.ID, &file.Name, &file.Size, &file.ContentType,
			&file.Uploader, &file.CreatedAt, &file.Downloads); err != nil {
			return nil, err
		}
		files = append(files, file)
	}

	return files, rows.Err()
}

func CurrentUsage() (Usage, error) {
	var usage Usage
	usage.Limit = maxTotal

	err := db.DB.QueryRow(
		"SELECT count(*), coalesce(sum(size), 0) FROM public_files",
	).Scan(&usage.Files, &usage.Bytes)

	return usage, err
}

func ByID(id string) (*File, error) {
	var file File

	err := db.DB.QueryRow(
		`SELECT id, name, size, content_type, uploader, created_at, downloads
			FROM public_files WHERE id = ?`, id,
	).Scan(&file.ID, &file.Name, &file.Size, &file.ContentType,
		&file.Uploader, &file.CreatedAt, &file.Downloads)
	if err != nil {
		return nil, ErrNotFound
	}

	return &file, nil
}

func Open(id string) (*File, *os.File, error) {
	file, err := ByID(id)
	if err != nil {
		return nil, nil, err
	}

	handle, err := storage.Open(path.Join(area, id))
	if err != nil {
		return nil, nil, ErrNotFound
	}

	if _, err := db.DB.Exec(
		"UPDATE public_files SET downloads = downloads + 1 WHERE id = ?", id,
	); err != nil {
		handle.Close()
		return nil, nil, err
	}

	return file, handle, nil
}

func Upload(name, uploader string, body io.Reader) (*File, error) {
	clean := cleanName(name)
	if clean == "" {
		return nil, ErrInvalidName
	}

	usage, err := CurrentUsage()
	if err != nil {
		return nil, err
	}
	if usage.Files >= maxFiles || usage.Bytes >= maxTotal {
		return nil, ErrFull
	}

	raw := make([]byte, idBytes)
	if _, err := rand.Read(raw); err != nil {
		return nil, err
	}
	id := hex.EncodeToString(raw)

	room := maxTotal - usage.Bytes
	if room > maxFileSize {
		room = maxFileSize
	}

	counted := &countingReader{reader: io.LimitReader(body, room+1), limit: room}
	if err := storage.Write(path.Join(area, id), counted); err != nil {
		storage.Remove(path.Join(area, id))
		return nil, err
	}
	if counted.over {
		storage.Remove(path.Join(area, id))
		return nil, ErrTooLarge
	}

	file := File{
		ID:          id,
		Name:        clean,
		Size:        counted.read,
		ContentType: contentType(clean),
		Uploader:    uploader,
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	}

	if _, err := db.DB.Exec(
		`INSERT INTO public_files (id, name, size, content_type, uploader, created_at)
			VALUES (?, ?, ?, ?, ?, ?)`,
		file.ID, file.Name, file.Size, file.ContentType, file.Uploader, file.CreatedAt,
	); err != nil {
		storage.Remove(path.Join(area, id))
		return nil, err
	}

	return &file, nil
}

func Delete(id string) error {
	result, err := db.DB.Exec("DELETE FROM public_files WHERE id = ?", id)
	if err != nil {
		return err
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}

	return storage.Remove(path.Join(area, id))
}

func contentType(name string) string {
	if found := mime.TypeByExtension(strings.ToLower(path.Ext(name))); found != "" {
		return found
	}

	return "application/octet-stream"
}

type countingReader struct {
	reader io.Reader
	limit  int64
	read   int64
	over   bool
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.reader.Read(p)
	c.read += int64(n)
	if c.read > c.limit {
		c.over = true
		return n, io.EOF
	}

	return n, err
}

func CurrentSettings() (*Settings, error) {
	var settings Settings

	if err := db.DB.QueryRow(
		"SELECT upload_key, uploads_open FROM public_store WHERE id = 1",
	).Scan(&settings.UploadKey, &settings.UploadsOpen); err != nil {
		return nil, err
	}

	if settings.UploadKey == "" {
		key, err := RotateKey()
		if err != nil {
			return nil, err
		}
		settings.UploadKey = key
	}

	return &settings, nil
}

func SetUploadsOpen(open bool) error {
	_, err := db.DB.Exec(
		"UPDATE public_store SET uploads_open = ?, updated_at = datetime('now') WHERE id = 1",
		open,
	)

	return err
}

func RotateKey() (string, error) {
	raw := make([]byte, keyBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	key := hex.EncodeToString(raw)

	if _, err := db.DB.Exec(
		"UPDATE public_store SET upload_key = ?, updated_at = datetime('now') WHERE id = 1",
		key,
	); err != nil {
		return "", err
	}

	return key, nil
}

func MayUpload(key string) (bool, error) {
	settings, err := CurrentSettings()
	if err != nil {
		return false, err
	}
	if settings.UploadsOpen {
		return true, nil
	}

	given := strings.TrimSpace(key)

	return given != "" && given == settings.UploadKey, nil
}
