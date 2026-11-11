package n8n

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
)

const pageSize = 250

type CredentialRef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Node struct {
	ID               string                   `json:"id"`
	Name             string                   `json:"name"`
	Type             string                   `json:"type"`
	TypeVersion      float64                  `json:"typeVersion"`
	Position         [2]float64               `json:"position"`
	Parameters       json.RawMessage          `json:"parameters"`
	Credentials      map[string]CredentialRef `json:"credentials,omitempty"`
	WebhookID        string                   `json:"webhookId,omitempty"`
	Disabled         bool                     `json:"disabled,omitempty"`
	Notes            string                   `json:"notes,omitempty"`
	NotesInFlow      bool                     `json:"notesInFlow,omitempty"`
	ExecuteOnce      bool                     `json:"executeOnce,omitempty"`
	AlwaysOutputData bool                     `json:"alwaysOutputData,omitempty"`
	RetryOnFail      bool                     `json:"retryOnFail,omitempty"`
	MaxTries         int                      `json:"maxTries,omitempty"`
	WaitBetweenTries int                      `json:"waitBetweenTries,omitempty"`
	OnError          string                   `json:"onError,omitempty"`
}

type WorkflowSettings struct {
	ExecutionOrder           string `json:"executionOrder,omitempty"`
	Timezone                 string `json:"timezone,omitempty"`
	SaveDataErrorExecution   string `json:"saveDataErrorExecution,omitempty"`
	SaveDataSuccessExecution string `json:"saveDataSuccessExecution,omitempty"`
	SaveManualExecutions     *bool  `json:"saveManualExecutions,omitempty"`
	SaveExecutionProgress    *bool  `json:"saveExecutionProgress,omitempty"`
	ExecutionTimeout         *int   `json:"executionTimeout,omitempty"`
	ErrorWorkflow            string `json:"errorWorkflow,omitempty"`
}

type Connection struct {
	Node  string `json:"node"`
	Type  string `json:"type"`
	Index int    `json:"index"`
}

type Connections map[string]map[string][][]Connection

type Workflow struct {
	ID          string           `json:"id"`
	Name        string           `json:"name"`
	Active      bool             `json:"active"`
	IsArchived  bool             `json:"isArchived"`
	Nodes       []Node           `json:"nodes"`
	Connections Connections      `json:"connections"`
	Settings    WorkflowSettings `json:"settings"`
	VersionID   string           `json:"versionId"`
	CreatedAt   string           `json:"createdAt"`
	UpdatedAt   string           `json:"updatedAt"`
}

type WorkflowInput struct {
	Name        string           `json:"name"`
	Nodes       []Node           `json:"nodes"`
	Connections Connections      `json:"connections"`
	Settings    WorkflowSettings `json:"settings"`
}

func (c *Client) Workflows(ctx context.Context) ([]Workflow, error) {
	var all []Workflow
	cursor := ""

	for {
		query := url.Values{"limit": {strconv.Itoa(pageSize)}, "excludePinnedData": {"true"}}
		if cursor != "" {
			query.Set("cursor", cursor)
		}

		var page struct {
			Data       []Workflow `json:"data"`
			NextCursor *string    `json:"nextCursor"`
		}
		if err := c.public(ctx, http.MethodGet, "/workflows", query, nil, &page); err != nil {
			return nil, err
		}

		all = append(all, page.Data...)
		if page.NextCursor == nil || *page.NextCursor == "" {
			return all, nil
		}
		cursor = *page.NextCursor
	}
}

func (c *Client) Workflow(ctx context.Context, id string) (*Workflow, error) {
	var wf Workflow
	if err := c.public(ctx, http.MethodGet, "/workflows/"+url.PathEscape(id), url.Values{"excludePinnedData": {"true"}}, nil, &wf); err != nil {
		return nil, err
	}

	return &wf, nil
}

func (c *Client) CreateWorkflow(ctx context.Context, in WorkflowInput) (*Workflow, error) {
	var wf Workflow
	if err := c.public(ctx, http.MethodPost, "/workflows", nil, in, &wf); err != nil {
		return nil, err
	}

	return &wf, nil
}

func (c *Client) UpdateWorkflow(ctx context.Context, id string, in WorkflowInput) (*Workflow, error) {
	var wf Workflow
	if err := c.public(ctx, http.MethodPut, "/workflows/"+url.PathEscape(id), nil, in, &wf); err != nil {
		return nil, err
	}

	return &wf, nil
}

func (c *Client) DeleteWorkflow(ctx context.Context, id string) error {
	return c.public(ctx, http.MethodDelete, "/workflows/"+url.PathEscape(id), nil, nil, nil)
}

func (c *Client) ActivateWorkflow(ctx context.Context, id string) (*Workflow, error) {
	var wf Workflow
	if err := c.public(ctx, http.MethodPost, "/workflows/"+url.PathEscape(id)+"/activate", nil, nil, &wf); err != nil {
		return nil, err
	}

	return &wf, nil
}

func (c *Client) DeactivateWorkflow(ctx context.Context, id string) (*Workflow, error) {
	var wf Workflow
	if err := c.public(ctx, http.MethodPost, "/workflows/"+url.PathEscape(id)+"/deactivate", nil, nil, &wf); err != nil {
		return nil, err
	}

	return &wf, nil
}
