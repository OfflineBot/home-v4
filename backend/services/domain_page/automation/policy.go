package automation

import (
	"bytes"
	"encoding/json"
	"strings"
	"time"
	"unicode/utf8"

	"home-v4/backend/services/db"
	store "home-v4/backend/store/domain_page"
	"home-v4/libs/n8n"
)

type ValidationError struct {
	Code  string
	Field string
	Node  string
}

func (e *ValidationError) Error() string {
	msg := "automation: " + e.Code
	if e.Field != "" {
		msg += " field " + e.Field
	}
	if e.Node != "" {
		msg += " node " + e.Node
	}

	return msg
}

const (
	maxNameRunes     = 128
	maxNodes         = 250
	maxNotesRunes    = 10000
	maxTries         = 10
	maxRetryWaitMs   = 60000
	maxTimeoutSecond = 86400
	maxWorkflows     = 100
	maxCredentials   = 100
)

var blockedNodes = map[string]bool{
	"n8n-nodes-base.executeCommand":         true,
	"n8n-nodes-base.localFileTrigger":       true,
	"n8n-nodes-base.readWriteFile":          true,
	"n8n-nodes-base.readBinaryFile":         true,
	"n8n-nodes-base.readBinaryFiles":        true,
	"n8n-nodes-base.writeBinaryFile":        true,
	"n8n-nodes-base.executeWorkflow":        true,
	"n8n-nodes-base.n8n":                    true,
	"n8n-nodes-base.n8nTrigger":             true,
	"n8n-nodes-base.git":                    true,
	"@n8n/n8n-nodes-langchain.toolWorkflow": true,
}

var adminNodes = map[string]bool{
	"n8n-nodes-base.code":                      true,
	"n8n-nodes-base.function":                  true,
	"n8n-nodes-base.functionItem":              true,
	"n8n-nodes-base.aiTransform":               true,
	"n8n-nodes-base.httpRequest":               true,
	"n8n-nodes-base.ssh":                       true,
	"n8n-nodes-base.ftp":                       true,
	"@n8n/n8n-nodes-langchain.code":            true,
	"@n8n/n8n-nodes-langchain.toolCode":        true,
	"@n8n/n8n-nodes-langchain.toolHttpRequest": true,
	"@n8n/n8n-nodes-langchain.mcpClientTool":   true,
	"@n8n/n8n-nodes-langchain.mcpClient":       true,
}

var onErrorModes = map[string]bool{
	"":                      true,
	"stopWorkflow":          true,
	"continueRegularOutput": true,
	"continueErrorOutput":   true,
}

var saveModes = map[string]bool{"": true, "all": true, "none": true}

func nodeAllowed(nodeType string, admin bool) bool {
	if blockedNodes[nodeType] {
		return false
	}

	return admin || !adminNodes[nodeType]
}

func invalid(field string) error {
	return &ValidationError{Code: "invalid_workflow", Field: field}
}

func prepareWorkflow(actor Actor, in WorkflowInput, previous *n8n.Workflow) (*n8n.WorkflowInput, error) {
	name, ok := cleanName(in.Name)
	if !ok {
		return nil, invalid("name")
	}
	if len(in.Nodes) > maxNodes {
		return nil, invalid("nodes")
	}

	cat, err := loadCatalog()
	if err != nil {
		return nil, err
	}

	owned, err := ownedCredentials(actor.ID)
	if err != nil {
		return nil, err
	}

	earlier := map[string]n8n.Node{}
	if previous != nil {
		for _, node := range previous.Nodes {
			earlier[node.Name] = node
		}
	}

	names := map[string]bool{}
	ids := map[string]bool{}
	nodes := make([]n8n.Node, 0, len(in.Nodes))

	for _, node := range in.Nodes {
		if prev, ok := earlier[strings.TrimSpace(node.Name)]; ok && prev.Type == node.Type {
			if node.ID == "" {
				node.ID = prev.ID
			}
			if node.WebhookID == "" {
				node.WebhookID = prev.WebhookID
			}
		}

		clean, err := prepareNode(actor, cat, owned, node)
		if err != nil {
			return nil, err
		}
		if names[clean.Name] {
			return nil, &ValidationError{Code: "invalid_workflow", Field: "nodes.name", Node: clean.Name}
		}
		if ids[clean.ID] {
			return nil, &ValidationError{Code: "invalid_workflow", Field: "nodes.id", Node: clean.Name}
		}
		names[clean.Name] = true
		ids[clean.ID] = true
		nodes = append(nodes, clean)
	}

	connections, err := checkConnections(in.Connections, names)
	if err != nil {
		return nil, err
	}

	settings, err := cleanSettings(actor.ID, in.Settings)
	if err != nil {
		return nil, err
	}

	return &n8n.WorkflowInput{Name: name, Nodes: nodes, Connections: connections, Settings: settings}, nil
}

func prepareNode(actor Actor, cat *catalog, owned map[string]store.AutomationCredential, node n8n.Node) (n8n.Node, error) {
	name, ok := cleanName(node.Name)
	if !ok {
		return node, invalid("nodes.name")
	}
	node.Name = name

	entries, known := cat.nodes[node.Type]
	if !known {
		return node, &ValidationError{Code: "unknown_node", Field: "nodes.type", Node: name}
	}
	if !nodeAllowed(node.Type, actor.Admin) {
		return node, &ValidationError{Code: "blocked_node", Field: "nodes.type", Node: name}
	}

	entry, ok := entryFor(entries, node.TypeVersion)
	if !ok {
		return node, &ValidationError{Code: "invalid_workflow", Field: "nodes.typeVersion", Node: name}
	}

	if node.ID == "" {
		node.ID = newID()
	} else if !validID(node.ID) {
		return node, &ValidationError{Code: "invalid_workflow", Field: "nodes.id", Node: name}
	}

	if hasWebhooks(entry) && node.WebhookID == "" {
		node.WebhookID = newID()
	} else if node.WebhookID != "" && !validID(node.WebhookID) {
		return node, &ValidationError{Code: "invalid_workflow", Field: "nodes.webhookId", Node: name}
	}

	params := bytes.TrimSpace(node.Parameters)
	if len(params) == 0 || bytes.Equal(params, []byte("null")) {
		params = []byte("{}")
	}
	if params[0] != '{' || !json.Valid(params) {
		return node, &ValidationError{Code: "invalid_workflow", Field: "nodes.parameters", Node: name}
	}
	node.Parameters = params

	if !onErrorModes[node.OnError] || node.MaxTries < 0 || node.MaxTries > maxTries ||
		node.WaitBetweenTries < 0 || node.WaitBetweenTries > maxRetryWaitMs ||
		utf8.RuneCountInString(node.Notes) > maxNotesRunes {
		return node, &ValidationError{Code: "invalid_workflow", Field: "nodes.options", Node: name}
	}

	if isHomeNode(node.Type) {
		home, err := homeCredential(actor.ID)
		if err != nil {
			return node, err
		}
		node.Credentials = map[string]n8n.CredentialRef{HomeCredentialType: {ID: home.ID, Name: home.Name}}
		return node, nil
	}

	if len(node.Credentials) == 0 {
		node.Credentials = nil
	}
	for credType, ref := range node.Credentials {
		if credType == HomeCredentialType {
			return node, &ValidationError{Code: "unknown_credential", Field: "nodes.credentials", Node: name}
		}
		cred, ok := owned[ref.ID]
		if !ok {
			return node, &ValidationError{Code: "unknown_credential", Field: "nodes.credentials", Node: name}
		}
		if cred.Type != credType {
			return node, &ValidationError{Code: "credential_type_mismatch", Field: "nodes.credentials", Node: name}
		}
		node.Credentials[credType] = n8n.CredentialRef{ID: cred.ID, Name: cred.Name}
	}

	return node, nil
}

func checkConnections(in n8n.Connections, names map[string]bool) (n8n.Connections, error) {
	if in == nil {
		return n8n.Connections{}, nil
	}

	for source, byType := range in {
		if !names[source] {
			return nil, invalid("connections")
		}
		for kind, outputs := range byType {
			if kind == "" {
				return nil, invalid("connections")
			}
			for _, targets := range outputs {
				for _, target := range targets {
					if !names[target.Node] || target.Type == "" || target.Index < 0 {
						return nil, invalid("connections")
					}
				}
			}
		}
	}

	return in, nil
}

func cleanSettings(userID int64, in *n8n.WorkflowSettings) (n8n.WorkflowSettings, error) {
	out := n8n.WorkflowSettings{ExecutionOrder: "v1"}
	if in == nil {
		return out, nil
	}

	switch in.ExecutionOrder {
	case "":
	case "v0", "v1":
		out.ExecutionOrder = in.ExecutionOrder
	default:
		return out, invalid("settings.executionOrder")
	}

	if in.Timezone != "" {
		if _, err := time.LoadLocation(in.Timezone); err != nil {
			return out, invalid("settings.timezone")
		}
		out.Timezone = in.Timezone
	}

	if !saveModes[in.SaveDataErrorExecution] || !saveModes[in.SaveDataSuccessExecution] {
		return out, invalid("settings.saveData")
	}
	out.SaveDataErrorExecution = in.SaveDataErrorExecution
	out.SaveDataSuccessExecution = in.SaveDataSuccessExecution
	out.SaveManualExecutions = in.SaveManualExecutions
	out.SaveExecutionProgress = in.SaveExecutionProgress

	if in.ExecutionTimeout != nil {
		timeout := *in.ExecutionTimeout
		if timeout != -1 && (timeout < 1 || timeout > maxTimeoutSecond) {
			return out, invalid("settings.executionTimeout")
		}
		out.ExecutionTimeout = &timeout
	}

	if in.ErrorWorkflow != "" {
		owned, err := store.AutomationWorkflowOwned(db.DB, userID, in.ErrorWorkflow)
		if err != nil {
			return out, err
		}
		if !owned {
			return out, invalid("settings.errorWorkflow")
		}
		out.ErrorWorkflow = in.ErrorWorkflow
	}

	return out, nil
}

func checkPolicy(actor Actor, wf *n8n.Workflow) error {
	owned, err := ownedCredentials(actor.ID)
	if err != nil {
		return err
	}

	for _, node := range wf.Nodes {
		if !nodeAllowed(node.Type, actor.Admin) {
			return &ValidationError{Code: "blocked_node", Field: "nodes.type", Node: node.Name}
		}
		for credType, ref := range node.Credentials {
			cred, ok := owned[ref.ID]
			if !ok || cred.Type != credType {
				return &ValidationError{Code: "unknown_credential", Field: "nodes.credentials", Node: node.Name}
			}
		}
	}

	return nil
}

func usesCredential(wf *n8n.Workflow, credentialID string) bool {
	for _, node := range wf.Nodes {
		for _, ref := range node.Credentials {
			if ref.ID == credentialID {
				return true
			}
		}
	}

	return false
}

func ownedCredentials(userID int64) (map[string]store.AutomationCredential, error) {
	creds, err := store.AutomationCredentialsByOwner(db.DB, userID)
	if err != nil {
		return nil, err
	}

	owned := make(map[string]store.AutomationCredential, len(creds)+1)
	for _, cred := range creds {
		owned[cred.ID] = cred
	}

	access, err := store.AutomationHomeAccessByUser(db.DB, userID)
	if err != nil {
		return nil, err
	}
	if access != nil {
		owned[access.CredentialID] = *homeView(userID, access.CredentialID)
	}

	return owned, nil
}

func cleanName(raw string) (string, bool) {
	name := strings.TrimSpace(raw)
	return name, name != "" && utf8.RuneCountInString(name) <= maxNameRunes
}

func validID(id string) bool {
	if id == "" || len(id) > 64 {
		return false
	}

	for _, r := range id {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
		default:
			return false
		}
	}

	return true
}
