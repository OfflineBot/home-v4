package automation

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"sync"

	"home-v4/backend/services/db"
	"home-v4/backend/services/domain_page/lights"
	"home-v4/backend/services/domain_page/machine"
	store "home-v4/backend/store/domain_page"
	"home-v4/libs/n8n"
)

type Option struct {
	Name        string `json:"name"`
	Value       any    `json:"value"`
	Description string `json:"description,omitempty"`
}

const (
	HomeCredentialType = "homeV4Api"
	homeCredentialName = "home-v4"
	homeNodePrefix     = "CUSTOM.homeV4"
	customNodePrefix   = "CUSTOM."
	backendURLEnv      = "AUTOMATION_BACKEND_URL"
	defaultBackendURL  = "http://backend:8080"
	homeTokenPrefix    = "hv4_"
	homeTokenBytes     = 32
	allLights          = "all"
	allLightsName      = "All Lights"
)

var (
	ErrInvalidToken  = errors.New("automation home token invalid")
	ErrUnknownMethod = errors.New("automation option method unknown")
)

var homeMu sync.Mutex

func isHomeNode(nodeType string) bool {
	return strings.HasPrefix(nodeType, homeNodePrefix)
}

func UserByToken(token string) (int64, error) {
	if !strings.HasPrefix(token, homeTokenPrefix) {
		return 0, ErrInvalidToken
	}

	userID, err := store.AutomationHomeUser(db.DB, hashToken(token))
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrInvalidToken
	}

	return userID, err
}

func HomeOptions(userID int64, method string, params map[string]string) ([]Option, error) {
	options := []Option{}

	switch method {
	case "getMachines":
		list, err := machine.List(userID)
		if err != nil {
			return nil, err
		}
		for _, m := range list {
			options = append(options, Option{Name: m.Name, Value: m.ID, Description: m.IP})
		}
	case "getLights":
		list, err := lights.List(userID)
		if err != nil {
			return nil, err
		}
		if len(list) > 1 {
			options = append(options, Option{
				Name:        allLightsName,
				Value:       allLights,
				Description: strconv.Itoa(len(list)) + " lights at once",
			})
		}
		for _, l := range list {
			options = append(options, Option{Name: l.Name, Value: l.ID})
		}
	case "getPresets":
		id, err := strconv.ParseInt(params["light"], 10, 64)
		if err != nil {
			return options, nil
		}
		presets, err := lights.Presets(userID, id)
		if err != nil {
			return nil, err
		}
		for _, p := range presets {
			options = append(options, Option{Name: p.Name, Value: p.ID})
		}
	default:
		return nil, ErrUnknownMethod
	}

	return options, nil
}

func homeCredential(userID int64) (*store.AutomationCredential, error) {
	homeMu.Lock()
	defer homeMu.Unlock()

	access, err := store.AutomationHomeAccessByUser(db.DB, userID)
	if err != nil {
		return nil, err
	}
	if access != nil {
		return homeView(userID, access.CredentialID), nil
	}

	c, err := ready()
	if err != nil {
		return nil, err
	}

	token, err := newHomeToken()
	if err != nil {
		return nil, err
	}

	data, err := json.Marshal(map[string]string{"baseUrl": backendURL(), "token": token})
	if err != nil {
		return nil, err
	}

	mutate.RLock()
	defer mutate.RUnlock()

	ctx, cancel := callContext()
	defer cancel()

	created, err := c.CreateCredential(ctx, n8n.CredentialInput{
		Name: homeCredentialName,
		Type: HomeCredentialType,
		Data: data,
	})
	if err != nil {
		return nil, upstream(err)
	}

	access = &store.AutomationHomeAccess{UserID: userID, CredentialID: created.ID, TokenHash: hashToken(token)}
	if err := store.SaveAutomationHomeAccess(db.DB, *access, now()); err != nil {
		if delErr := c.DeleteCredential(ctx, created.ID); delErr != nil {
			slog.Warn("automation: rollback of home credential failed", "credential", created.ID, "err", delErr)
		}
		return nil, err
	}

	return homeView(userID, created.ID), nil
}

func removeHomeCredential(ctx context.Context, c *n8n.Client, userID int64) {
	access, err := store.AutomationHomeAccessByUser(db.DB, userID)
	if err != nil || access == nil {
		return
	}

	if err := c.DeleteCredential(ctx, access.CredentialID); err != nil && !errors.Is(err, n8n.ErrNotFound) {
		slog.Warn("automation: deleting home credential of removed user failed", "user", userID, "err", err)
	}
}

func homeView(userID int64, credentialID string) *store.AutomationCredential {
	return &store.AutomationCredential{
		ID:      credentialID,
		OwnerID: userID,
		Name:    homeCredentialName,
		Type:    HomeCredentialType,
	}
}

func backendURL() string {
	if value := strings.TrimSpace(os.Getenv(backendURLEnv)); value != "" {
		return strings.TrimRight(value, "/")
	}
	return defaultBackendURL
}

func newHomeToken() (string, error) {
	raw := make([]byte, homeTokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}

	return homeTokenPrefix + base64.RawURLEncoding.EncodeToString(raw), nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
