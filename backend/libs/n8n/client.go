package n8n

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	apiKeyHeader   = "X-N8N-API-KEY"
	sessionCookie  = "n8n-auth"
	defaultTimeout = 60 * time.Second
	maxResponse    = 16 << 20
	maxCatalog     = 128 << 20
)

var (
	ErrUnauthorized = errors.New("n8n: unauthorized")
	ErrNotFound     = errors.New("n8n: not found")
	ErrNoOwner      = errors.New("n8n: owner login not configured")
)

type APIError struct {
	Status  int
	Message string
}

func (e *APIError) Error() string {
	if e.Message == "" {
		return fmt.Sprintf("n8n: status %d", e.Status)
	}

	return fmt.Sprintf("n8n: status %d: %s", e.Status, e.Message)
}

func (e *APIError) Is(target error) bool {
	switch target {
	case ErrUnauthorized:
		return e.Status == http.StatusUnauthorized
	case ErrNotFound:
		return e.Status == http.StatusNotFound
	}

	return false
}

type Client struct {
	BaseURL string
	HTTP    *http.Client

	mu       sync.Mutex
	apiKey   string
	email    string
	password string
	session  string
}

func New(baseURL string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTP:    &http.Client{Timeout: defaultTimeout},
	}
}

func (c *Client) SetAPIKey(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.apiKey = key
}

func (c *Client) UseOwner(email, password string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.email != email || c.password != password {
		c.session = ""
	}
	c.email = email
	c.password = password
}

func (c *Client) key() string {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.apiKey
}

func (c *Client) owner() (string, string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.email, c.password
}

func (c *Client) currentSession() string {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.session
}

func (c *Client) setSession(value string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.session = value
}

func (c *Client) public(ctx context.Context, method, path string, query url.Values, in, out any) error {
	req, err := c.newRequest(ctx, method, "/api/v1"+path, query, in)
	if err != nil {
		return err
	}
	req.Header.Set(apiKeyHeader, c.key())

	return c.do(req, out, maxResponse)
}

func (c *Client) rest(ctx context.Context, method, path string, in, out any) error {
	var envelope struct {
		Data json.RawMessage `json:"data"`
	}

	if err := c.withSession(ctx, func() (*http.Request, error) {
		return c.newRequest(ctx, method, "/rest"+path, nil, in)
	}, &envelope, maxResponse); err != nil {
		return err
	}

	if out == nil || len(envelope.Data) == 0 {
		return nil
	}

	return json.Unmarshal(envelope.Data, out)
}

func (c *Client) withSession(ctx context.Context, build func() (*http.Request, error), out any, limit int64) error {
	if c.currentSession() == "" {
		if err := c.login(ctx); err != nil {
			return err
		}
	}

	for attempt := 0; ; attempt++ {
		req, err := build()
		if err != nil {
			return err
		}
		req.AddCookie(&http.Cookie{Name: sessionCookie, Value: c.currentSession()})

		err = c.do(req, out, limit)
		if attempt == 0 && errors.Is(err, ErrUnauthorized) {
			if err := c.login(ctx); err != nil {
				return err
			}
			continue
		}

		return err
	}
}

func (c *Client) newRequest(ctx context.Context, method, path string, query url.Values, in any) (*http.Request, error) {
	target := c.BaseURL + path
	if len(query) > 0 {
		target += "?" + query.Encode()
	}

	var body io.Reader
	if in != nil {
		raw, err := json.Marshal(in)
		if err != nil {
			return nil, err
		}
		body = bytes.NewReader(raw)
	}

	req, err := http.NewRequestWithContext(ctx, method, target, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	return req, nil
}

func (c *Client) do(req *http.Request, out any, limit int64) error {
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if cookie := sessionFrom(resp); cookie != "" {
		c.setSession(cookie)
	}

	raw, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return err
	}
	if int64(len(raw)) > limit {
		return fmt.Errorf("n8n: response larger than %d bytes", limit)
	}

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return &APIError{Status: resp.StatusCode, Message: errorMessage(raw)}
	}

	if body, ok := out.(*rawBody); ok {
		body.data = raw
		body.contentType = resp.Header.Get("Content-Type")
		return nil
	}

	if out == nil || len(bytes.TrimSpace(raw)) == 0 {
		return nil
	}

	return json.Unmarshal(raw, out)
}

type rawBody struct {
	data        []byte
	contentType string
}

func sessionFrom(resp *http.Response) string {
	for _, cookie := range resp.Cookies() {
		if cookie.Name == sessionCookie && cookie.Value != "" {
			return cookie.Value
		}
	}

	return ""
}

func errorMessage(raw []byte) string {
	var body struct {
		Message string `json:"message"`
	}
	if json.Unmarshal(raw, &body) == nil && body.Message != "" {
		return body.Message
	}

	text := strings.TrimSpace(string(raw))
	if len(text) > 300 {
		text = text[:300]
	}

	return text
}
