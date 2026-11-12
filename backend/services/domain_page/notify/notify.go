package notify

import (
	"crypto/rand"
	"database/sql"
	_ "embed"
	"encoding/hex"
	"errors"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"home-v4/backend/services/db"
)

//go:embed schema.sql
var Schema string

const (
	maxTitle   = 120
	maxBody    = 1000
	maxLink    = 200
	maxKept    = 200
	fanoutSize = 16
)

var (
	ErrInvalidMessage = errors.New("invalid message")
	ErrNotFound       = errors.New("not found")
	ErrHookDisabled   = errors.New("hook disabled")
)

type Message struct {
	Title  string `json:"title"`
	Body   string `json:"body"`
	Link   string `json:"link"`
	Source string `json:"source"`
}

type Notification struct {
	ID        int64  `json:"id"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	Link      string `json:"link"`
	Source    string `json:"source"`
	CreatedAt string `json:"created_at"`
	Read      bool   `json:"read"`
}

type Settings struct {
	HookEnabled bool   `json:"hook_enabled"`
	HookKey     string `json:"hook_key"`
}

var hub = struct {
	sync.Mutex
	listeners map[int64]map[chan Notification]struct{}
}{listeners: map[int64]map[chan Notification]struct{}{}}

func Subscribe(userID int64) (<-chan Notification, func()) {
	stream := make(chan Notification, fanoutSize)

	hub.Lock()
	if hub.listeners[userID] == nil {
		hub.listeners[userID] = map[chan Notification]struct{}{}
	}
	hub.listeners[userID][stream] = struct{}{}
	hub.Unlock()

	return stream, func() {
		hub.Lock()
		delete(hub.listeners[userID], stream)
		if len(hub.listeners[userID]) == 0 {
			delete(hub.listeners, userID)
		}
		hub.Unlock()
		close(stream)
	}
}

func publish(userID int64, n Notification) {
	hub.Lock()
	defer hub.Unlock()

	for stream := range hub.listeners[userID] {
		select {
		case stream <- n:
		default:
		}
	}
}

func stamp() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func clean(value string, max int) string {
	value = strings.TrimSpace(strings.ReplaceAll(value, "\r", ""))
	if utf8.RuneCountInString(value) <= max {
		return value
	}

	return string([]rune(value)[:max])
}

func Send(userID int64, message Message) (*Notification, error) {
	title := clean(message.Title, maxTitle)
	if title == "" {
		return nil, ErrInvalidMessage
	}

	n := Notification{
		Title:  title,
		Body:   clean(message.Body, maxBody),
		Link:   clean(message.Link, maxLink),
		Source: clean(message.Source, 32),
	}

	n.CreatedAt = stamp()

	result, err := db.DB.Exec(
		"INSERT INTO notifications (user_id, title, body, link, source, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		userID, n.Title, n.Body, n.Link, n.Source, n.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	n.ID, err = result.LastInsertId()
	if err != nil {
		return nil, err
	}

	if _, err := db.DB.Exec(
		`DELETE FROM notifications WHERE user_id = ? AND id NOT IN
			(SELECT id FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?)`,
		userID, userID, maxKept,
	); err != nil {
		return nil, err
	}

	publish(userID, n)
	return &n, nil
}

func List(userID int64, limit int) ([]Notification, error) {
	if limit <= 0 || limit > maxKept {
		limit = 50
	}

	rows, err := db.DB.Query(
		`SELECT id, title, body, link, source, created_at, read_at IS NOT NULL
			FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
		userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []Notification{}
	for rows.Next() {
		var n Notification
		if err := rows.Scan(&n.ID, &n.Title, &n.Body, &n.Link, &n.Source, &n.CreatedAt, &n.Read); err != nil {
			return nil, err
		}
		list = append(list, n)
	}

	return list, rows.Err()
}

func Unread(userID int64) (int, error) {
	var count int
	err := db.DB.QueryRow(
		"SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL",
		userID,
	).Scan(&count)

	return count, err
}

func MarkRead(userID, id int64) error {
	_, err := db.DB.Exec(
		"UPDATE notifications SET read_at = ? WHERE user_id = ? AND id = ? AND read_at IS NULL",
		stamp(), userID, id,
	)

	return err
}

func MarkAllRead(userID int64) error {
	_, err := db.DB.Exec(
		"UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL",
		stamp(), userID,
	)

	return err
}

func Delete(userID, id int64) error {
	_, err := db.DB.Exec("DELETE FROM notifications WHERE user_id = ? AND id = ?", userID, id)
	return err
}

func Clear(userID int64) error {
	_, err := db.DB.Exec("DELETE FROM notifications WHERE user_id = ?", userID)
	return err
}

func CurrentSettings(userID int64) (*Settings, error) {
	var settings Settings

	err := db.DB.QueryRow(
		"SELECT hook_key, hook_enabled FROM notify_settings WHERE user_id = ?", userID,
	).Scan(&settings.HookKey, &settings.HookEnabled)

	if errors.Is(err, sql.ErrNoRows) {
		if _, err := db.DB.Exec("INSERT INTO notify_settings (user_id) VALUES (?)", userID); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}

	if settings.HookKey == "" {
		key, err := RotateKey(userID)
		if err != nil {
			return nil, err
		}
		settings.HookKey = key
	}

	return &settings, nil
}

func SetHookEnabled(userID int64, enabled bool) error {
	if _, err := CurrentSettings(userID); err != nil {
		return err
	}

	_, err := db.DB.Exec(
		"UPDATE notify_settings SET hook_enabled = ?, updated_at = datetime('now') WHERE user_id = ?",
		enabled, userID,
	)

	return err
}

func RotateKey(userID int64) (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	key := hex.EncodeToString(raw)

	if _, err := db.DB.Exec(
		`INSERT INTO notify_settings (user_id, hook_key) VALUES (?, ?)
			ON CONFLICT(user_id) DO UPDATE SET hook_key = excluded.hook_key,
				updated_at = datetime('now')`,
		userID, key,
	); err != nil {
		return "", err
	}

	return key, nil
}

func HookEnabled(userID int64) (bool, error) {
	var enabled bool

	err := db.DB.QueryRow(
		"SELECT hook_enabled FROM notify_settings WHERE user_id = ?", userID,
	).Scan(&enabled)

	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}

	return enabled, err
}

func UserByHookKey(key string) (int64, error) {
	key = strings.TrimSpace(key)
	if len(key) != 32 {
		return 0, ErrNotFound
	}

	var userID int64
	var enabled bool

	err := db.DB.QueryRow(
		"SELECT user_id, hook_enabled FROM notify_settings WHERE hook_key = ?", key,
	).Scan(&userID, &enabled)

	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrNotFound
	}
	if err != nil {
		return 0, err
	}
	if !enabled {
		return 0, ErrHookDisabled
	}

	return userID, nil
}
