package n8n

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
)

type Execution struct {
	ID         string          `json:"id"`
	WorkflowID string          `json:"workflowId"`
	Mode       string          `json:"mode"`
	Status     string          `json:"status"`
	Finished   bool            `json:"finished"`
	RetryOf    *string         `json:"retryOf"`
	StartedAt  *string         `json:"startedAt"`
	StoppedAt  *string         `json:"stoppedAt"`
	WaitTill   *string         `json:"waitTill"`
	Data       json.RawMessage `json:"data,omitempty"`
}

type ExecutionQuery struct {
	WorkflowID string
	Status     string
	Cursor     string
	Limit      int
}

type ExecutionPage struct {
	Executions []Execution
	NextCursor string
}

func (c *Client) Executions(ctx context.Context, q ExecutionQuery) (*ExecutionPage, error) {
	query := url.Values{}
	if q.WorkflowID != "" {
		query.Set("workflowId", q.WorkflowID)
	}
	if q.Status != "" {
		query.Set("status", q.Status)
	}
	if q.Cursor != "" {
		query.Set("cursor", q.Cursor)
	}
	if q.Limit > 0 {
		query.Set("limit", strconv.Itoa(q.Limit))
	}

	var page struct {
		Data       []Execution `json:"data"`
		NextCursor *string     `json:"nextCursor"`
	}
	if err := c.public(ctx, http.MethodGet, "/executions", query, nil, &page); err != nil {
		return nil, err
	}

	result := &ExecutionPage{Executions: page.Data}
	if page.NextCursor != nil {
		result.NextCursor = *page.NextCursor
	}

	return result, nil
}

func (c *Client) Execution(ctx context.Context, id string, includeData bool) (*Execution, error) {
	query := url.Values{"includeData": {strconv.FormatBool(includeData)}}

	var exec Execution
	if err := c.public(ctx, http.MethodGet, "/executions/"+url.PathEscape(id), query, nil, &exec); err != nil {
		return nil, err
	}

	return &exec, nil
}

func (c *Client) DeleteExecution(ctx context.Context, id string) error {
	return c.public(ctx, http.MethodDelete, "/executions/"+url.PathEscape(id), nil, nil, nil)
}
