package automation

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	_ "embed"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"sync"
	"time"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"
	"home-v4/libs/n8n"
)

//go:embed schema.sql
var Schema string

type Actor struct {
	ID    int64
	Admin bool
}

type Status struct {
	Enabled   bool    `json:"enabled"`
	Ready     bool    `json:"ready"`
	Error     *string `json:"error"`
	Version   *string `json:"version"`
	CheckedAt *string `json:"checked_at"`
}

type RejectedError struct {
	Message string
}

func (e *RejectedError) Error() string {
	return "n8n rejected request: " + e.Message
}

const (
	urlEnv       = "N8N_URL"
	keyEnv       = "TOTP_SECRET_KEY"
	keyBytes     = 32
	keyLabel     = "home-v4-backend"
	ownerEmail   = "automation@home-v4.local"
	ownerFirst   = "Home"
	ownerLast    = "Automation"
	scopeOwner   = "n8n:owner-password"
	scopeAPIKey  = "n8n:api-key"
	callTimeout  = 60 * time.Second
	setupTimeout = 2 * time.Minute
	retryMin     = 5 * time.Second
	retryMax     = 5 * time.Minute
	checkEvery   = 5 * time.Minute
)

var apiScopes = []string{
	"workflow:create", "workflow:read", "workflow:list", "workflow:update", "workflow:delete",
	"workflow:activate", "workflow:deactivate",
	"credential:create", "credential:read", "credential:list", "credential:update", "credential:delete",
	"execution:list", "execution:read", "execution:delete",
}

var (
	ErrDisabled     = errors.New("automation disabled")
	ErrUnavailable  = errors.New("automation unavailable")
	ErrNotFound     = errors.New("automation item not found")
	ErrLimitReached = errors.New("automation limit reached")
	ErrUpstream     = errors.New("automation upstream failed")
	ErrKeyUnset     = errors.New("TOTP_SECRET_KEY not set")

	errUnreachable = errors.New("n8n unreachable")
	errUnclaimed   = errors.New("n8n owner exists but is not known to this backend")
)

var (
	client *n8n.Client
	aead   cipher.AEAD
	kick   = make(chan struct{}, 1)

	stateMu sync.RWMutex
	state   = Status{}

	mutate sync.RWMutex
)

func Setup() error {
	base := os.Getenv(urlEnv)
	if base == "" {
		return nil
	}

	if err := setupCipher(); err != nil {
		return err
	}

	client = n8n.New(base)
	starting := "starting"
	setState(Status{Enabled: true, Error: &starting})

	go maintain()

	return nil
}

func CurrentStatus() Status {
	stateMu.RLock()
	defer stateMu.RUnlock()

	return state
}

func RemoveUser(userID int64) error {
	c, err := ready()
	if err != nil {
		return nil
	}

	mutate.RLock()
	defer mutate.RUnlock()

	ctx, cancel := context.WithTimeout(context.Background(), setupTimeout)
	defer cancel()

	workflows, err := store.AutomationWorkflowsByOwner(db.DB, userID)
	if err != nil {
		return err
	}
	for _, id := range workflows {
		if err := removeWorkflow(ctx, c, id); err != nil {
			slog.Warn("automation: deleting workflow of removed user failed", "user", userID, "workflow", id, "err", err)
		}
	}

	creds, err := store.AutomationCredentialsByOwner(db.DB, userID)
	if err != nil {
		return err
	}
	for _, cred := range creds {
		if err := c.DeleteCredential(ctx, cred.ID); err != nil && !errors.Is(err, n8n.ErrNotFound) {
			slog.Warn("automation: deleting credential of removed user failed", "user", userID, "credential", cred.ID, "err", err)
		}
	}

	removeHomeCredential(ctx, c, userID)

	return nil
}

func ready() (*n8n.Client, error) {
	if client == nil {
		return nil, ErrDisabled
	}

	if !CurrentStatus().Ready {
		return nil, ErrUnavailable
	}

	return client, nil
}

func callContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), callTimeout)
}

func upstream(err error) error {
	if err == nil {
		return nil
	}

	var apiErr *n8n.APIError
	switch {
	case errors.Is(err, n8n.ErrUnauthorized):
		reset()
		return ErrUnavailable
	case errors.Is(err, n8n.ErrNotFound):
		return ErrNotFound
	case errors.As(err, &apiErr) && apiErr.Status == 400:
		return &RejectedError{Message: apiErr.Message}
	case errors.As(err, &apiErr):
		return fmt.Errorf("%w: %w", ErrUpstream, err)
	case unreachable(err):
		return fmt.Errorf("%w: %w", ErrUnavailable, err)
	}

	return fmt.Errorf("%w: %w", ErrUpstream, err)
}

func unreachable(err error) bool {
	var netErr net.Error
	return errors.As(err, &netErr) || errors.Is(err, context.DeadlineExceeded)
}

func reset() {
	stateMu.Lock()
	state.Ready = false
	code := "reconnecting"
	state.Error = &code
	stateMu.Unlock()

	select {
	case kick <- struct{}{}:
	default:
	}
}

func setState(s Status) {
	stateMu.Lock()
	defer stateMu.Unlock()

	state = s
}

func maintain() {
	wait := retryMin

	for {
		version, err := bootstrap()
		now := time.Now().UTC().Format(time.RFC3339)

		next := Status{Enabled: true, Ready: err == nil, CheckedAt: &now}
		if version != "" {
			next.Version = &version
		}

		if err == nil {
			if !CurrentStatus().Ready {
				dropCatalog()
			}
			setState(next)
			reconcile()
			wait = checkEvery
		} else {
			code := setupCode(err)
			next.Error = &code
			setState(next)
			slog.Warn("automation: n8n not ready", "error", code, "err", err)

			if wait == checkEvery || wait < retryMin {
				wait = retryMin
			} else {
				wait = min(wait*2, retryMax)
			}
		}

		select {
		case <-time.After(wait):
		case <-kick:
		}
	}
}

func setupCode(err error) string {
	switch {
	case errors.Is(err, errUnreachable):
		return "unreachable"
	case errors.Is(err, errUnclaimed):
		return "unclaimed"
	}

	return "setup_failed"
}

func bootstrap() (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), setupTimeout)
	defer cancel()

	if err := connect(ctx); err != nil {
		return "", err
	}

	version, err := client.Version(ctx)
	if err != nil {
		return "", err
	}

	return version, nil
}

func connect(ctx context.Context) error {
	if err := client.Healthy(ctx); err != nil {
		return fmt.Errorf("%w: %w", errUnreachable, err)
	}

	info, err := client.Info(ctx)
	if err != nil {
		return fmt.Errorf("%w: %w", errUnreachable, err)
	}

	inst, err := store.AutomationInstanceRow(db.DB)
	if err != nil {
		return err
	}

	if inst == nil {
		if !info.NeedsSetup {
			return errUnclaimed
		}

		inst, err = newInstance()
		if err != nil {
			return err
		}
	}

	password, err := open(scopeOwner, inst.OwnerPassword)
	if err != nil {
		return fmt.Errorf("stored n8n owner unreadable: %w", err)
	}
	client.UseOwner(inst.OwnerEmail, password)

	if info.NeedsSetup {
		owner := n8n.Owner{Email: inst.OwnerEmail, FirstName: ownerFirst, LastName: ownerLast, Password: password}
		if err := client.SetupOwner(ctx, owner); err != nil {
			return err
		}
	}

	if inst.APIKey != nil {
		if key, err := open(scopeAPIKey, *inst.APIKey); err == nil {
			client.SetAPIKey(key)

			err := client.Ping(ctx)
			if err == nil {
				return nil
			}
			if !errors.Is(err, n8n.ErrUnauthorized) {
				return fmt.Errorf("%w: %w", errUnreachable, err)
			}
		}
	}

	if err := client.Login(ctx); err != nil {
		if errors.Is(err, n8n.ErrUnauthorized) {
			return fmt.Errorf("%w: %w", errUnclaimed, err)
		}
		return err
	}

	key, err := client.RotateAPIKey(ctx, keyLabel, apiScopes)
	if err != nil {
		return err
	}

	sealed, err := seal(scopeAPIKey, key)
	if err != nil {
		return err
	}
	if err := store.SetAutomationAPIKey(db.DB, &sealed, time.Now().UTC().Format(time.RFC3339)); err != nil {
		return err
	}

	client.SetAPIKey(key)

	return client.Ping(ctx)
}

func newInstance() (*store.AutomationInstance, error) {
	password, err := newPassword()
	if err != nil {
		return nil, err
	}

	sealed, err := seal(scopeOwner, password)
	if err != nil {
		return nil, err
	}

	inst := store.AutomationInstance{OwnerEmail: ownerEmail, OwnerPassword: sealed}
	if err := store.SaveAutomationInstance(db.DB, inst, time.Now().UTC().Format(time.RFC3339)); err != nil {
		return nil, err
	}

	return &inst, nil
}

func reconcile() {
	mutate.Lock()
	defer mutate.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), setupTimeout)
	defer cancel()

	owned, err := store.AllAutomationWorkflows(db.DB)
	if err != nil {
		slog.Warn("automation: reading workflow owners failed", "err", err)
		return
	}
	known := make(map[string]bool, len(owned))
	for _, id := range owned {
		known[id] = true
	}

	workflows, err := client.Workflows(ctx)
	if err != nil {
		slog.Warn("automation: listing workflows failed", "err", err)
		return
	}

	for _, wf := range workflows {
		if !wf.Active || known[wf.ID] {
			continue
		}
		if _, err := client.DeactivateWorkflow(ctx, wf.ID); err != nil {
			slog.Warn("automation: deactivating orphaned workflow failed", "workflow", wf.ID, "err", err)
			continue
		}
		slog.Info("automation: deactivated orphaned workflow", "workflow", wf.ID)
	}

	ownedCreds, err := store.AllAutomationCredentials(db.DB)
	if err != nil {
		slog.Warn("automation: reading credential owners failed", "err", err)
		return
	}
	homeCreds, err := store.AllAutomationHomeCredentials(db.DB)
	if err != nil {
		slog.Warn("automation: reading home credentials failed", "err", err)
		return
	}
	ownedCreds = append(ownedCreds, homeCreds...)
	knownCreds := make(map[string]bool, len(ownedCreds))
	for _, id := range ownedCreds {
		knownCreds[id] = true
	}

	creds, err := client.Credentials(ctx)
	if err != nil {
		slog.Warn("automation: listing credentials failed", "err", err)
		return
	}

	for _, cred := range creds {
		if knownCreds[cred.ID] {
			continue
		}
		if err := client.DeleteCredential(ctx, cred.ID); err != nil && !errors.Is(err, n8n.ErrNotFound) {
			slog.Warn("automation: deleting orphaned credential failed", "credential", cred.ID, "err", err)
			continue
		}
		slog.Info("automation: deleted orphaned credential", "credential", cred.ID)
	}
}

func setupCipher() error {
	raw := os.Getenv(keyEnv)
	if raw == "" {
		return ErrKeyUnset
	}

	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return err
	}
	if len(key) != keyBytes {
		return fmt.Errorf("%s must decode to %d bytes", keyEnv, keyBytes)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}

	aead, err = cipher.NewGCMWithRandomNonce(block)
	return err
}

func seal(scope, plain string) (string, error) {
	if aead == nil {
		return "", ErrKeyUnset
	}

	return base64.StdEncoding.EncodeToString(aead.Seal(nil, nil, []byte(plain), []byte(scope))), nil
}

func open(scope, stored string) (string, error) {
	if aead == nil {
		return "", ErrKeyUnset
	}

	sealed, err := base64.StdEncoding.DecodeString(stored)
	if err != nil {
		return "", err
	}

	plain, err := aead.Open(nil, nil, sealed, []byte(scope))
	if err != nil {
		return "", err
	}

	return string(plain), nil
}

func newPassword() (string, error) {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}

	return base64.RawURLEncoding.EncodeToString(raw) + "Aa1", nil
}

func newID() string {
	raw := make([]byte, 16)
	rand.Read(raw)
	raw[6] = raw[6]&0x0f | 0x40
	raw[8] = raw[8]&0x3f | 0x80

	return fmt.Sprintf("%x-%x-%x-%x-%x", raw[0:4], raw[4:6], raw[6:8], raw[8:10], raw[10:16])
}
