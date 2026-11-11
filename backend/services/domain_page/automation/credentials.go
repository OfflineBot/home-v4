package automation

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"
	"home-v4/libs/n8n"
)

type Credential = store.AutomationCredential

type CredentialInput struct {
	Name string          `json:"name"`
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

type CredentialUpdate struct {
	Name *string         `json:"name"`
	Data json.RawMessage `json:"data"`
}

type InUseError struct {
	Workflows []string
}

func (e *InUseError) Error() string {
	return "automation credential is used by workflows"
}

const maxCredentialData = 64 << 10

func invalidCredential(field string) error {
	return &ValidationError{Code: "invalid_credential", Field: field}
}

func Credentials(userID int64) ([]Credential, error) {
	return store.AutomationCredentialsByOwner(db.DB, userID)
}

func CreateCredential(actor Actor, in CredentialInput) (*Credential, error) {
	name, ok := cleanName(in.Name)
	if !ok {
		return nil, invalidCredential("name")
	}

	data, ok := credentialData(in.Data)
	if !ok {
		return nil, invalidCredential("data")
	}

	cat, err := loadCatalog()
	if err != nil {
		return nil, err
	}
	t, known := cat.creds[in.Type]
	if !known || !credentialTypeAllowed(t, actor.Admin) {
		return nil, invalidCredential("type")
	}

	count, err := store.CountAutomationCredentials(db.DB, actor.ID)
	if err != nil {
		return nil, err
	}
	if count >= maxCredentials {
		return nil, ErrLimitReached
	}

	c, err := ready()
	if err != nil {
		return nil, err
	}

	mutate.RLock()
	defer mutate.RUnlock()

	ctx, cancel := callContext()
	defer cancel()

	created, err := c.CreateCredential(ctx, n8n.CredentialInput{Name: name, Type: in.Type, Data: data})
	if err != nil {
		return nil, upstream(err)
	}

	at := now()
	cred := store.AutomationCredential{
		ID:        created.ID,
		OwnerID:   actor.ID,
		Name:      name,
		Type:      in.Type,
		CreatedAt: at,
		UpdatedAt: at,
	}
	if err := store.AddAutomationCredential(db.DB, cred); err != nil {
		if delErr := c.DeleteCredential(ctx, created.ID); delErr != nil {
			slog.Warn("automation: rollback of created credential failed", "credential", created.ID, "err", delErr)
		}
		return nil, err
	}

	return &cred, nil
}

func UpdateCredential(userID int64, id string, in CredentialUpdate) (*Credential, error) {
	cred, err := ownedCredential(userID, id)
	if err != nil {
		return nil, err
	}

	patch := n8n.CredentialInput{Type: cred.Type}
	name := cred.Name

	if in.Name != nil {
		clean, ok := cleanName(*in.Name)
		if !ok {
			return nil, invalidCredential("name")
		}
		name = clean
		patch.Name = clean
	}

	if len(bytes.TrimSpace(in.Data)) > 0 && !bytes.Equal(bytes.TrimSpace(in.Data), []byte("null")) {
		data, ok := credentialData(in.Data)
		if !ok {
			return nil, invalidCredential("data")
		}
		patch.Data = data
	}

	if patch.Name == "" && patch.Data == nil {
		return nil, invalidCredential("body")
	}

	c, err := ready()
	if err != nil {
		return nil, err
	}

	ctx, cancel := callContext()
	defer cancel()

	if _, err := c.UpdateCredential(ctx, id, patch); err != nil {
		return nil, upstream(err)
	}

	if err := store.RenameAutomationCredential(db.DB, userID, id, name, now()); err != nil {
		return nil, err
	}

	return ownedCredential(userID, id)
}

func DeleteCredential(userID int64, id string) error {
	if _, err := ownedCredential(userID, id); err != nil {
		return err
	}

	ids, err := store.AutomationWorkflowsByOwner(db.DB, userID)
	if err != nil {
		return err
	}

	if len(ids) > 0 {
		all, err := allWorkflows()
		if err != nil {
			return err
		}

		owned := make(map[string]bool, len(ids))
		for _, wid := range ids {
			owned[wid] = true
		}

		users := []string{}
		for i := range all {
			if owned[all[i].ID] && !all[i].IsArchived && usesCredential(&all[i], id) {
				users = append(users, all[i].ID)
			}
		}
		if len(users) > 0 {
			return &InUseError{Workflows: users}
		}
	}

	c, err := ready()
	if err != nil {
		return err
	}

	ctx, cancel := callContext()
	defer cancel()

	if err := c.DeleteCredential(ctx, id); err != nil && !errors.Is(err, n8n.ErrNotFound) {
		return upstream(err)
	}

	return store.RemoveAutomationCredential(db.DB, userID, id)
}

func ownedCredential(userID int64, id string) (*Credential, error) {
	if !validID(id) {
		return nil, ErrNotFound
	}

	cred, err := store.AutomationCredentialByID(db.DB, userID, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}

	return cred, err
}

func credentialData(raw json.RawMessage) (json.RawMessage, bool) {
	data := bytes.TrimSpace(raw)
	if len(data) == 0 || len(data) > maxCredentialData || data[0] != '{' || !json.Valid(data) {
		return nil, false
	}

	return data, true
}
