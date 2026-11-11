package automation

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"home-v4/libs/n8n"
)

type CredentialTest struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}

type RunResult struct {
	Status      int             `json:"status"`
	ContentType string          `json:"content_type"`
	JSON        json.RawMessage `json:"json"`
	Text        *string         `json:"text"`
	Truncated   bool            `json:"truncated"`
}

const (
	webhookNode    = "n8n-nodes-base.webhook"
	maxRunBody     = 64 << 10
	maxRunResponse = 256 << 10
)

var (
	ErrNotActive   = errors.New("automation workflow not active")
	ErrNoWebhook   = errors.New("automation workflow has no webhook trigger")
	ErrDynamicPath = errors.New("automation webhook path has dynamic parts")
)

func TestCredential(userID int64, id string) (*CredentialTest, error) {
	if _, err := ownedCredential(userID, id); err != nil {
		return nil, err
	}

	c, err := ready()
	if err != nil {
		return nil, err
	}

	ctx, cancel := callContext()
	defer cancel()

	result, err := c.TestCredential(ctx, id)
	if err != nil {
		return nil, upstream(err)
	}

	return &CredentialTest{OK: strings.EqualFold(result.Status, "OK"), Message: result.Message}, nil
}

func RunWorkflow(userID int64, id string, body json.RawMessage) (*RunResult, error) {
	payload := bytes.TrimSpace(body)
	if len(payload) == 0 || bytes.Equal(payload, []byte("null")) {
		payload = []byte("{}")
	}
	if len(payload) > maxRunBody || !json.Valid(payload) {
		return nil, &ValidationError{Code: "invalid_body"}
	}

	wf, err := ownedWorkflow(userID, id)
	if err != nil {
		return nil, err
	}
	if !wf.Active {
		return nil, ErrNotActive
	}

	method, path, err := webhookTarget(wf)
	if err != nil {
		return nil, err
	}

	c, err := ready()
	if err != nil {
		return nil, err
	}

	ctx, cancel := callContext()
	defer cancel()

	resp, err := c.CallWebhook(ctx, method, path, payload, maxRunResponse)
	if err != nil {
		return nil, upstream(err)
	}

	result := &RunResult{Status: resp.Status, ContentType: resp.ContentType, Truncated: resp.Truncated}
	if !resp.Truncated && json.Valid(resp.Body) && len(bytes.TrimSpace(resp.Body)) > 0 {
		result.JSON = resp.Body
	} else if utf8.Valid(resp.Body) {
		text := string(resp.Body)
		result.Text = &text
	}

	return result, nil
}

func webhookTarget(wf *n8n.Workflow) (string, string, error) {
	for _, node := range wf.Nodes {
		if node.Type != webhookNode || node.Disabled {
			continue
		}

		var params struct {
			Path       string          `json:"path"`
			HTTPMethod json.RawMessage `json:"httpMethod"`
		}
		json.Unmarshal(node.Parameters, &params)

		path := strings.Trim(params.Path, "/")
		if path == "" {
			path = node.WebhookID
		}
		if path == "" {
			continue
		}
		if strings.Contains(path, ":") || strings.HasPrefix(path, "=") {
			return "", "", ErrDynamicPath
		}

		return webhookMethod(params.HTTPMethod), path, nil
	}

	return "", "", ErrNoWebhook
}

func webhookMethod(raw json.RawMessage) string {
	var single string
	if json.Unmarshal(raw, &single) == nil && single != "" {
		return strings.ToUpper(single)
	}

	var many []string
	if json.Unmarshal(raw, &many) == nil && len(many) > 0 {
		for _, method := range many {
			if strings.EqualFold(method, http.MethodPost) {
				return http.MethodPost
			}
		}
		return strings.ToUpper(many[0])
	}

	return http.MethodGet
}
