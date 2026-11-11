package n8n

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

var ErrInvalidIconPath = errors.New("n8n: invalid icon path")

type Versions []float64

func (v *Versions) UnmarshalJSON(raw []byte) error {
	raw = bytes.TrimSpace(raw)
	if len(raw) > 0 && raw[0] == '[' {
		var list []float64
		if err := json.Unmarshal(raw, &list); err != nil {
			return err
		}
		*v = list
		return nil
	}

	var single float64
	if err := json.Unmarshal(raw, &single); err != nil {
		return err
	}
	*v = Versions{single}

	return nil
}

func (v Versions) Contains(version float64) bool {
	for _, candidate := range v {
		if candidate == version {
			return true
		}
	}

	return false
}

func (v Versions) Latest() float64 {
	var latest float64
	for _, candidate := range v {
		if candidate > latest {
			latest = candidate
		}
	}

	return latest
}

type NodeCredential struct {
	Name     string `json:"name"`
	Required bool   `json:"required"`
}

type Codex struct {
	Categories    []string            `json:"categories"`
	Subcategories map[string][]string `json:"subcategories"`
}

type NodeType struct {
	Name           string           `json:"name"`
	DisplayName    string           `json:"displayName"`
	Description    string           `json:"description"`
	Group          []string         `json:"group"`
	Version        Versions         `json:"version"`
	DefaultVersion float64          `json:"defaultVersion"`
	Hidden         bool             `json:"hidden"`
	Polling        bool             `json:"polling"`
	Icon           json.RawMessage  `json:"icon"`
	IconColor      string           `json:"iconColor"`
	IconURL        json.RawMessage  `json:"iconUrl"`
	Credentials    []NodeCredential `json:"credentials"`
	Webhooks       json.RawMessage  `json:"webhooks"`
	Inputs         json.RawMessage  `json:"inputs"`
	Outputs        json.RawMessage  `json:"outputs"`
	Codex          Codex            `json:"codex"`
	Raw            json.RawMessage  `json:"-"`
}

type CredentialType struct {
	Name             string            `json:"name"`
	DisplayName      string            `json:"displayName"`
	DocumentationURL string            `json:"documentationUrl"`
	Extends          []string          `json:"extends"`
	Properties       []json.RawMessage `json:"properties"`
	SupportedNodes   []string          `json:"supportedNodes"`
	GenericAuth      bool              `json:"genericAuth"`
	Icon             json.RawMessage   `json:"icon"`
	IconURL          json.RawMessage   `json:"iconUrl"`
}

type Icon struct {
	Data        []byte
	ContentType string
}

func (c *Client) NodeTypes(ctx context.Context) ([]NodeType, error) {
	var entries []json.RawMessage
	if err := c.catalog(ctx, "/types/nodes.json", &entries); err != nil {
		return nil, err
	}

	types := make([]NodeType, 0, len(entries))
	for _, entry := range entries {
		var t NodeType
		if err := json.Unmarshal(entry, &t); err != nil || t.Name == "" {
			continue
		}
		t.Raw = entry
		types = append(types, t)
	}

	return types, nil
}

func (c *Client) CredentialTypes(ctx context.Context) ([]CredentialType, error) {
	var entries []json.RawMessage
	if err := c.catalog(ctx, "/types/credentials.json", &entries); err != nil {
		return nil, err
	}

	types := make([]CredentialType, 0, len(entries))
	for _, entry := range entries {
		var t CredentialType
		if err := json.Unmarshal(entry, &t); err != nil || t.Name == "" {
			continue
		}
		types = append(types, t)
	}

	return types, nil
}

func (c *Client) Icon(ctx context.Context, path string) (*Icon, error) {
	if !validIconPath(path) {
		return nil, ErrInvalidIconPath
	}

	var body rawBody
	err := c.withSession(ctx, func() (*http.Request, error) {
		return c.newRequest(ctx, http.MethodGet, "/"+path, nil, nil)
	}, &body, maxResponse)
	if err != nil {
		return nil, err
	}

	return &Icon{Data: body.data, ContentType: body.contentType}, nil
}

func (c *Client) catalog(ctx context.Context, path string, out any) error {
	return c.withSession(ctx, func() (*http.Request, error) {
		return c.newRequest(ctx, http.MethodGet, path, nil, nil)
	}, out, maxCatalog)
}

func validIconPath(path string) bool {
	if !strings.HasPrefix(path, "icons/") || strings.Contains(path, "..") || strings.Contains(path, "//") {
		return false
	}
	if !strings.HasSuffix(path, ".svg") && !strings.HasSuffix(path, ".png") {
		return false
	}

	for _, r := range path {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
		case strings.ContainsRune("@._-/", r):
		default:
			return false
		}
	}

	return true
}
