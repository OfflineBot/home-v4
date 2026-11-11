package n8n

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
)

type Credential struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type CredentialInput struct {
	Name string          `json:"name,omitempty"`
	Type string          `json:"type,omitempty"`
	Data json.RawMessage `json:"data,omitempty"`
}

func (c *Client) Credentials(ctx context.Context) ([]Credential, error) {
	var all []Credential
	cursor := ""

	for {
		query := url.Values{"limit": {strconv.Itoa(pageSize)}}
		if cursor != "" {
			query.Set("cursor", cursor)
		}

		var page struct {
			Data       []Credential `json:"data"`
			NextCursor *string      `json:"nextCursor"`
		}
		if err := c.public(ctx, http.MethodGet, "/credentials", query, nil, &page); err != nil {
			return nil, err
		}

		all = append(all, page.Data...)
		if page.NextCursor == nil || *page.NextCursor == "" {
			return all, nil
		}
		cursor = *page.NextCursor
	}
}

func (c *Client) CreateCredential(ctx context.Context, in CredentialInput) (*Credential, error) {
	var cred Credential
	if err := c.public(ctx, http.MethodPost, "/credentials", nil, in, &cred); err != nil {
		return nil, err
	}

	return &cred, nil
}

func (c *Client) UpdateCredential(ctx context.Context, id string, in CredentialInput) (*Credential, error) {
	var cred Credential
	if err := c.public(ctx, http.MethodPatch, "/credentials/"+url.PathEscape(id), nil, in, &cred); err != nil {
		return nil, err
	}

	return &cred, nil
}

type CredentialTest struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

func (c *Client) TestCredential(ctx context.Context, id string) (*CredentialTest, error) {
	var result CredentialTest
	if err := c.public(ctx, http.MethodPost, "/credentials/"+url.PathEscape(id)+"/test", nil, nil, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

func (c *Client) DeleteCredential(ctx context.Context, id string) error {
	return c.public(ctx, http.MethodDelete, "/credentials/"+url.PathEscape(id), nil, nil, nil)
}

func (c *Client) CredentialSchema(ctx context.Context, credentialType string) (json.RawMessage, error) {
	var schema json.RawMessage
	if err := c.public(ctx, http.MethodGet, "/credentials/schema/"+url.PathEscape(credentialType), nil, nil, &schema); err != nil {
		return nil, err
	}

	return schema, nil
}
