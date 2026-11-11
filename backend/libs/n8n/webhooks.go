package n8n

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/url"
	"strings"
)

type WebhookResponse struct {
	Status      int
	ContentType string
	Body        []byte
	Truncated   bool
}

func (c *Client) CallWebhook(ctx context.Context, method, path string, body []byte, limit int64) (*WebhookResponse, error) {
	segments := strings.Split(strings.Trim(path, "/"), "/")
	for i, segment := range segments {
		segments[i] = url.PathEscape(segment)
	}

	var reader io.Reader
	if len(body) > 0 && method != http.MethodGet && method != http.MethodHead {
		reader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+"/webhook/"+strings.Join(segments, "/"), reader)
	if err != nil {
		return nil, err
	}
	if reader != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return nil, err
	}

	result := &WebhookResponse{Status: resp.StatusCode, ContentType: resp.Header.Get("Content-Type")}
	if int64(len(raw)) > limit {
		raw = raw[:limit]
		result.Truncated = true
	}
	result.Body = raw

	return result, nil
}
