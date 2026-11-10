package settings

import (
	"errors"
	"strings"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/settings"
)

type Settings = store.Settings

var ErrInvalidTheme = errors.New("invalid theme")

func ByUser(userID int64) (*Settings, error) {
	return store.ByUser(db.DB, userID)
}

func SetTheme(userID int64, theme string) error {
	theme = strings.TrimSpace(theme)
	if theme == "" {
		return ErrInvalidTheme
	}

	return store.SetTheme(db.DB, userID, theme)
}
