package automation

import (
	"encoding/json"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"
	"home-v4/libs/n8n"
)

type Execution struct {
	ID         string          `json:"id"`
	WorkflowID string          `json:"workflow_id"`
	Mode       string          `json:"mode"`
	Status     string          `json:"status"`
	Finished   bool            `json:"finished"`
	RetryOf    *string         `json:"retry_of"`
	StartedAt  *string         `json:"started_at"`
	StoppedAt  *string         `json:"stopped_at"`
	WaitTill   *string         `json:"wait_till"`
	Data       json.RawMessage `json:"data,omitempty"`
}

type ExecutionPage struct {
	Executions []Execution `json:"executions"`
	NextCursor *string     `json:"next_cursor"`
}

type ExecutionQuery struct {
	Status string
	Cursor string
	Limit  int
}

const (
	defaultExecutionLimit = 20
	maxExecutionLimit     = 100
	maxCursorBytes        = 512
)

var executionStatuses = map[string]bool{
	"":         true,
	"canceled": true,
	"crashed":  true,
	"error":    true,
	"new":      true,
	"running":  true,
	"success":  true,
	"unknown":  true,
	"waiting":  true,
}

func Executions(userID int64, workflowID string, q ExecutionQuery) (*ExecutionPage, error) {
	if err := requireWorkflow(userID, workflowID); err != nil {
		return nil, err
	}
	if !executionStatuses[q.Status] || len(q.Cursor) > maxCursorBytes {
		return nil, &ValidationError{Code: "invalid_query"}
	}

	limit := q.Limit
	if limit <= 0 {
		limit = defaultExecutionLimit
	}
	limit = min(limit, maxExecutionLimit)

	c, err := ready()
	if err != nil {
		return nil, err
	}

	ctx, cancel := callContext()
	defer cancel()

	page, err := c.Executions(ctx, n8n.ExecutionQuery{
		WorkflowID: workflowID,
		Status:     q.Status,
		Cursor:     q.Cursor,
		Limit:      limit,
	})
	if err != nil {
		return nil, upstream(err)
	}

	result := &ExecutionPage{Executions: []Execution{}}
	for _, exec := range page.Executions {
		if exec.WorkflowID == workflowID {
			result.Executions = append(result.Executions, executionView(exec))
		}
	}
	if page.NextCursor != "" {
		result.NextCursor = &page.NextCursor
	}

	return result, nil
}

func ExecutionByID(userID int64, id string) (*Execution, error) {
	if !validID(id) {
		return nil, ErrNotFound
	}

	c, err := ready()
	if err != nil {
		return nil, err
	}

	ctx, cancel := callContext()
	defer cancel()

	exec, err := c.Execution(ctx, id, true)
	if err != nil {
		return nil, upstream(err)
	}

	owned, err := store.AutomationWorkflowOwned(db.DB, userID, exec.WorkflowID)
	if err != nil {
		return nil, err
	}
	if !owned {
		return nil, ErrNotFound
	}

	view := executionView(*exec)
	view.Data = exec.Data

	return &view, nil
}

func executionView(exec n8n.Execution) Execution {
	return Execution{
		ID:         exec.ID,
		WorkflowID: exec.WorkflowID,
		Mode:       exec.Mode,
		Status:     exec.Status,
		Finished:   exec.Finished,
		RetryOf:    exec.RetryOf,
		StartedAt:  exec.StartedAt,
		StoppedAt:  exec.StoppedAt,
		WaitTill:   exec.WaitTill,
	}
}
