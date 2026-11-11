package n8n

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
)

type Owner struct {
	Email     string `json:"email"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Password  string `json:"password"`
}

type Info struct {
	NeedsSetup bool
}

type APIKey struct {
	ID     string   `json:"id"`
	Label  string   `json:"label"`
	Scopes []string `json:"scopes"`
}

var errNoSession = errors.New("n8n: login returned no session")

func (c *Client) Healthy(ctx context.Context) error {
	req, err := c.newRequest(ctx, http.MethodGet, "/healthz", nil, nil)
	if err != nil {
		return err
	}

	return c.do(req, nil, maxResponse)
}

func (c *Client) Info(ctx context.Context) (*Info, error) {
	var envelope struct {
		Data struct {
			UserManagement struct {
				ShowSetupOnFirstLoad bool `json:"showSetupOnFirstLoad"`
			} `json:"userManagement"`
		} `json:"data"`
	}

	req, err := c.newRequest(ctx, http.MethodGet, "/rest/settings", nil, nil)
	if err != nil {
		return nil, err
	}
	if err := c.do(req, &envelope, maxResponse); err != nil {
		return nil, err
	}

	return &Info{NeedsSetup: envelope.Data.UserManagement.ShowSetupOnFirstLoad}, nil
}

func (c *Client) Version(ctx context.Context) (string, error) {
	var settings struct {
		VersionCli string `json:"versionCli"`
	}
	if err := c.rest(ctx, http.MethodGet, "/settings", nil, &settings); err != nil {
		return "", err
	}

	return settings.VersionCli, nil
}

func (c *Client) SetupOwner(ctx context.Context, owner Owner) error {
	c.setSession("")

	req, err := c.newRequest(ctx, http.MethodPost, "/rest/owner/setup", nil, owner)
	if err != nil {
		return err
	}
	if err := c.do(req, nil, maxResponse); err != nil {
		return err
	}

	c.UseOwner(owner.Email, owner.Password)

	return nil
}

func (c *Client) Login(ctx context.Context) error {
	return c.login(ctx)
}

func (c *Client) login(ctx context.Context) error {
	email, password := c.owner()
	if email == "" || password == "" {
		return ErrNoOwner
	}

	c.setSession("")

	req, err := c.newRequest(ctx, http.MethodPost, "/rest/login", nil, map[string]string{
		"emailOrLdapLoginId": email,
		"password":           password,
	})
	if err != nil {
		return err
	}
	if err := c.do(req, nil, maxResponse); err != nil {
		return err
	}

	if c.currentSession() == "" {
		return errNoSession
	}

	return nil
}

func (c *Client) APIKeys(ctx context.Context) ([]APIKey, error) {
	var raw json.RawMessage
	if err := c.rest(ctx, http.MethodGet, "/api-keys", nil, &raw); err != nil {
		return nil, err
	}

	var keys []APIKey
	if err := json.Unmarshal(raw, &keys); err == nil {
		return keys, nil
	}

	var page struct {
		Items []APIKey `json:"items"`
	}
	if err := json.Unmarshal(raw, &page); err != nil {
		return nil, err
	}

	return page.Items, nil
}

func (c *Client) CreateAPIKey(ctx context.Context, label string, scopes []string) (string, error) {
	var created struct {
		RawAPIKey string `json:"rawApiKey"`
	}

	err := c.rest(ctx, http.MethodPost, "/api-keys", map[string]any{
		"label":     label,
		"expiresAt": nil,
		"scopes":    scopes,
	}, &created)
	if err != nil {
		return "", err
	}
	if created.RawAPIKey == "" {
		return "", errors.New("n8n: api key response without key")
	}

	return created.RawAPIKey, nil
}

func (c *Client) DeleteAPIKey(ctx context.Context, id string) error {
	return c.rest(ctx, http.MethodDelete, "/api-keys/"+url.PathEscape(id), nil, nil)
}

func (c *Client) RotateAPIKey(ctx context.Context, label string, scopes []string) (string, error) {
	keys, err := c.APIKeys(ctx)
	if err != nil {
		return "", err
	}

	for _, key := range keys {
		if key.Label != label {
			continue
		}
		if err := c.DeleteAPIKey(ctx, key.ID); err != nil && !errors.Is(err, ErrNotFound) {
			return "", err
		}
	}

	return c.CreateAPIKey(ctx, label, scopes)
}

func (c *Client) Ping(ctx context.Context) error {
	return c.public(ctx, http.MethodGet, "/workflows", url.Values{"limit": {"1"}}, nil, nil)
}
