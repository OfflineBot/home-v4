package automation

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"time"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"
	"home-v4/libs/n8n"
)

type WorkflowInput struct {
	Name        string                `json:"name"`
	Nodes       []n8n.Node            `json:"nodes"`
	Connections n8n.Connections       `json:"connections"`
	Settings    *n8n.WorkflowSettings `json:"settings"`
}

type WorkflowSummary struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Active    bool     `json:"active"`
	NodeCount int      `json:"node_count"`
	NodeTypes []string `json:"node_types"`
	CreatedAt string   `json:"created_at"`
	UpdatedAt string   `json:"updated_at"`
}

type Workflow struct {
	ID          string               `json:"id"`
	Name        string               `json:"name"`
	Active      bool                 `json:"active"`
	Nodes       []n8n.Node           `json:"nodes"`
	Connections n8n.Connections      `json:"connections"`
	Settings    n8n.WorkflowSettings `json:"settings"`
	CreatedAt   string               `json:"created_at"`
	UpdatedAt   string               `json:"updated_at"`
}

const (
	deleteRetries   = 10
	deleteRetryWait = time.Second
)

func Workflows(userID int64) ([]WorkflowSummary, error) {
	ids, err := store.AutomationWorkflowsByOwner(db.DB, userID)
	if err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return []WorkflowSummary{}, nil
	}

	all, err := allWorkflows()
	if err != nil {
		return nil, err
	}

	owned := make(map[string]bool, len(ids))
	for _, id := range ids {
		owned[id] = true
	}

	list := []WorkflowSummary{}
	for _, wf := range all {
		if owned[wf.ID] && !wf.IsArchived {
			list = append(list, summarizeWorkflow(wf))
		}
	}
	sort.SliceStable(list, func(i, j int) bool {
		return strings.ToLower(list[i].Name) < strings.ToLower(list[j].Name)
	})

	return list, nil
}

func WorkflowByID(userID int64, id string) (*Workflow, error) {
	wf, err := ownedWorkflow(userID, id)
	if err != nil {
		return nil, err
	}

	return view(wf), nil
}

func CreateWorkflow(actor Actor, in WorkflowInput) (*Workflow, error) {
	c, err := ready()
	if err != nil {
		return nil, err
	}

	count, err := store.CountAutomationWorkflows(db.DB, actor.ID)
	if err != nil {
		return nil, err
	}
	if count >= maxWorkflows {
		return nil, ErrLimitReached
	}

	prepared, err := prepareWorkflow(actor, in, nil)
	if err != nil {
		return nil, err
	}

	mutate.RLock()
	defer mutate.RUnlock()

	ctx, cancel := callContext()
	defer cancel()

	created, err := c.CreateWorkflow(ctx, *prepared)
	if err != nil {
		return nil, upstream(err)
	}

	if err := store.AddAutomationWorkflow(db.DB, created.ID, actor.ID, now()); err != nil {
		if delErr := c.DeleteWorkflow(ctx, created.ID); delErr != nil {
			slog.Warn("automation: rollback of created workflow failed", "workflow", created.ID, "err", delErr)
		}
		return nil, err
	}

	return view(created), nil
}

func UpdateWorkflow(actor Actor, id string, in WorkflowInput) (*Workflow, error) {
	current, err := ownedWorkflow(actor.ID, id)
	if err != nil {
		return nil, err
	}

	prepared, err := prepareWorkflow(actor, in, current)
	if err != nil {
		return nil, err
	}
	if prepared.Settings.ErrorWorkflow == id {
		return nil, invalid("settings.errorWorkflow")
	}

	c, err := ready()
	if err != nil {
		return nil, err
	}

	ctx, cancel := callContext()
	defer cancel()

	updated, err := c.UpdateWorkflow(ctx, id, *prepared)
	if err != nil {
		return nil, upstream(err)
	}

	return view(updated), nil
}

func ActivateWorkflow(actor Actor, id string) (*Workflow, error) {
	wf, err := ownedWorkflow(actor.ID, id)
	if err != nil {
		return nil, err
	}
	if err := checkPolicy(actor, wf); err != nil {
		return nil, err
	}

	c, err := ready()
	if err != nil {
		return nil, err
	}

	ctx, cancel := callContext()
	defer cancel()

	activated, err := c.ActivateWorkflow(ctx, id)
	if err != nil {
		return nil, upstream(err)
	}

	return view(activated), nil
}

func DeactivateWorkflow(userID int64, id string) (*Workflow, error) {
	if err := requireWorkflow(userID, id); err != nil {
		return nil, err
	}

	c, err := ready()
	if err != nil {
		return nil, err
	}

	ctx, cancel := callContext()
	defer cancel()

	deactivated, err := c.DeactivateWorkflow(ctx, id)
	if err != nil {
		return nil, upstream(err)
	}

	return view(deactivated), nil
}

func DeleteWorkflow(userID int64, id string) error {
	if err := requireWorkflow(userID, id); err != nil {
		return err
	}

	c, err := ready()
	if err != nil {
		return err
	}

	ctx, cancel := callContext()
	defer cancel()

	if err := removeWorkflow(ctx, c, id); err != nil {
		return upstream(err)
	}

	return store.RemoveAutomationWorkflow(db.DB, userID, id)
}

func removeWorkflow(ctx context.Context, c *n8n.Client, id string) error {
	wf, err := c.Workflow(ctx, id)
	if errors.Is(err, n8n.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}

	if wf.Active {
		if _, err := c.DeactivateWorkflow(ctx, id); err != nil && !errors.Is(err, n8n.ErrNotFound) {
			return err
		}
	}

	for attempt := 0; ; attempt++ {
		err := c.DeleteWorkflow(ctx, id)
		if err == nil || errors.Is(err, n8n.ErrNotFound) {
			return nil
		}

		var apiErr *n8n.APIError
		if !errors.As(err, &apiErr) || apiErr.Status != http.StatusConflict || attempt >= deleteRetries {
			return err
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(deleteRetryWait):
		}
	}
}

func requireWorkflow(userID int64, id string) error {
	if !validID(id) {
		return ErrNotFound
	}

	owned, err := store.AutomationWorkflowOwned(db.DB, userID, id)
	if err != nil {
		return err
	}
	if !owned {
		return ErrNotFound
	}

	return nil
}

func ownedWorkflow(userID int64, id string) (*n8n.Workflow, error) {
	if err := requireWorkflow(userID, id); err != nil {
		return nil, err
	}

	c, err := ready()
	if err != nil {
		return nil, err
	}

	ctx, cancel := callContext()
	defer cancel()

	wf, err := c.Workflow(ctx, id)
	if err != nil {
		return nil, upstream(err)
	}
	if wf.IsArchived {
		return nil, ErrNotFound
	}

	return wf, nil
}

func allWorkflows() ([]n8n.Workflow, error) {
	c, err := ready()
	if err != nil {
		return nil, err
	}

	ctx, cancel := callContext()
	defer cancel()

	all, err := c.Workflows(ctx)
	if err != nil {
		return nil, upstream(err)
	}

	return all, nil
}

func view(wf *n8n.Workflow) *Workflow {
	nodes := wf.Nodes
	if nodes == nil {
		nodes = []n8n.Node{}
	}
	connections := wf.Connections
	if connections == nil {
		connections = n8n.Connections{}
	}

	return &Workflow{
		ID:          wf.ID,
		Name:        wf.Name,
		Active:      wf.Active,
		Nodes:       nodes,
		Connections: connections,
		Settings:    wf.Settings,
		CreatedAt:   wf.CreatedAt,
		UpdatedAt:   wf.UpdatedAt,
	}
}

func summarizeWorkflow(wf n8n.Workflow) WorkflowSummary {
	types := []string{}
	seen := map[string]bool{}
	for _, node := range wf.Nodes {
		if !seen[node.Type] {
			seen[node.Type] = true
			types = append(types, node.Type)
		}
	}

	return WorkflowSummary{
		ID:        wf.ID,
		Name:      wf.Name,
		Active:    wf.Active,
		NodeCount: len(wf.Nodes),
		NodeTypes: types,
		CreatedAt: wf.CreatedAt,
		UpdatedAt: wf.UpdatedAt,
	}
}

func now() string {
	return time.Now().UTC().Format(time.RFC3339)
}
