package automation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"sync"
	"time"

	"home-v4/libs/n8n"
)

type NodeSummary struct {
	Name           string               `json:"name"`
	DisplayName    string               `json:"display_name"`
	Description    string               `json:"description"`
	Group          []string             `json:"group"`
	Versions       []float64            `json:"versions"`
	DefaultVersion float64              `json:"default_version"`
	Trigger        bool                 `json:"trigger"`
	SubNode        bool                 `json:"sub_node"`
	Custom         bool                 `json:"custom"`
	Webhook        bool                 `json:"webhook"`
	Polling        bool                 `json:"polling"`
	Icon           *string              `json:"icon"`
	IconColor      *string              `json:"icon_color"`
	IconURL        *string              `json:"icon_url"`
	IconURLDark    *string              `json:"icon_url_dark"`
	Credentials    []n8n.NodeCredential `json:"credentials"`
	Categories     []string             `json:"categories"`
	Subcategories  map[string][]string  `json:"subcategories"`
	AdminOnly      bool                 `json:"admin_only"`
}

type CredentialTypeSummary struct {
	Name             string   `json:"name"`
	DisplayName      string   `json:"display_name"`
	DocumentationURL *string  `json:"documentation_url"`
	SupportedNodes   []string `json:"supported_nodes"`
	OAuth            bool     `json:"oauth"`
	Icon             *string  `json:"icon"`
	IconURL          *string  `json:"icon_url"`
	IconURLDark      *string  `json:"icon_url_dark"`
}

type CredentialTypeDetail struct {
	CredentialTypeSummary
	Properties []json.RawMessage `json:"properties"`
	Schema     json.RawMessage   `json:"schema"`
}

type Icon = n8n.Icon

const (
	catalogTTL    = 15 * time.Minute
	iconPrefix    = "icons/"
	iconRoute     = "/api/automation/icons/"
	docsPrefix    = "https://docs.n8n.io/integrations/builtin/credentials/"
	maxIconCache  = 2000
	maxExtendsHop = 10
)

type catalog struct {
	fetched   time.Time
	nodes     map[string][]n8n.NodeType
	nodeOrder []string
	creds     map[string]n8n.CredentialType
	credOrder []string
}

var (
	catalogMu sync.Mutex
	cached    *catalog

	iconMu sync.Mutex
	icons  = map[string]*Icon{}
)

func Nodes(actor Actor) ([]NodeSummary, error) {
	cat, err := loadCatalog()
	if err != nil {
		return nil, err
	}

	nodes := []NodeSummary{}
	for _, name := range cat.nodeOrder {
		entries := cat.nodes[name]
		latest := latestEntry(entries)
		if latest.Hidden || !nodeAllowed(name, actor.Admin) {
			continue
		}
		nodes = append(nodes, summarize(name, entries, latest))
	}

	return nodes, nil
}

func NodeDetail(actor Actor, nodeType string, version *float64) (json.RawMessage, error) {
	cat, err := loadCatalog()
	if err != nil {
		return nil, err
	}

	entries, ok := cat.nodes[nodeType]
	if !ok || !nodeAllowed(nodeType, actor.Admin) {
		return nil, ErrNotFound
	}

	if version == nil {
		return latestEntry(entries).Raw, nil
	}

	entry, ok := entryFor(entries, *version)
	if !ok {
		return nil, ErrNotFound
	}

	return entry.Raw, nil
}

func CredentialTypes(actor Actor) ([]CredentialTypeSummary, error) {
	cat, err := loadCatalog()
	if err != nil {
		return nil, err
	}

	types := []CredentialTypeSummary{}
	for _, name := range cat.credOrder {
		t := cat.creds[name]
		if !credentialTypeAllowed(t, actor.Admin) {
			continue
		}
		types = append(types, summarizeCredentialType(cat, t))
	}

	return types, nil
}

func CredentialType(actor Actor, name string) (*CredentialTypeDetail, error) {
	cat, err := loadCatalog()
	if err != nil {
		return nil, err
	}

	t, ok := cat.creds[name]
	if !ok || !credentialTypeAllowed(t, actor.Admin) {
		return nil, ErrNotFound
	}

	c, err := ready()
	if err != nil {
		return nil, err
	}

	ctx, cancel := callContext()
	defer cancel()

	schema, err := c.CredentialSchema(ctx, name)
	if err != nil {
		return nil, upstream(err)
	}

	return &CredentialTypeDetail{
		CredentialTypeSummary: summarizeCredentialType(cat, t),
		Properties:            resolveProperties(cat, t, 0),
		Schema:                schema,
	}, nil
}

func NodeIcon(path string) (*Icon, error) {
	full := iconPrefix + strings.TrimPrefix(path, "/")

	iconMu.Lock()
	icon, ok := icons[full]
	iconMu.Unlock()
	if ok {
		return icon, nil
	}

	c, err := ready()
	if err != nil {
		return nil, err
	}

	ctx, cancel := callContext()
	defer cancel()

	icon, err = c.Icon(ctx, full)
	if errors.Is(err, n8n.ErrInvalidIconPath) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, upstream(err)
	}
	icon.ContentType = strings.TrimSpace(strings.Split(icon.ContentType, ";")[0])
	if icon.ContentType != "image/svg+xml" && icon.ContentType != "image/png" {
		return nil, ErrNotFound
	}

	iconMu.Lock()
	if len(icons) >= maxIconCache {
		icons = map[string]*Icon{}
	}
	icons[full] = icon
	iconMu.Unlock()

	return icon, nil
}

func dropCatalog() {
	catalogMu.Lock()
	cached = nil
	catalogMu.Unlock()
}

func loadCatalog() (*catalog, error) {
	catalogMu.Lock()
	defer catalogMu.Unlock()

	if cached != nil && time.Since(cached.fetched) < catalogTTL {
		return cached, nil
	}

	c, err := ready()
	if err != nil {
		if cached != nil {
			return cached, nil
		}
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), setupTimeout)
	defer cancel()

	nodeTypes, err := c.NodeTypes(ctx)
	if err == nil && len(nodeTypes) == 0 {
		err = errors.New("n8n returned an empty node catalog")
	}
	if err != nil {
		if cached != nil {
			return cached, nil
		}
		return nil, upstream(err)
	}

	credTypes, err := c.CredentialTypes(ctx)
	if err != nil {
		if cached != nil {
			return cached, nil
		}
		return nil, upstream(err)
	}

	cat := &catalog{
		fetched: time.Now(),
		nodes:   map[string][]n8n.NodeType{},
		creds:   map[string]n8n.CredentialType{},
	}

	for _, t := range nodeTypes {
		if _, seen := cat.nodes[t.Name]; !seen {
			cat.nodeOrder = append(cat.nodeOrder, t.Name)
		}
		cat.nodes[t.Name] = append(cat.nodes[t.Name], t)
	}
	sort.SliceStable(cat.nodeOrder, func(i, j int) bool {
		a := latestEntry(cat.nodes[cat.nodeOrder[i]]).DisplayName
		b := latestEntry(cat.nodes[cat.nodeOrder[j]]).DisplayName
		return strings.ToLower(a) < strings.ToLower(b)
	})

	for _, t := range credTypes {
		if _, seen := cat.creds[t.Name]; !seen {
			cat.credOrder = append(cat.credOrder, t.Name)
		}
		cat.creds[t.Name] = t
	}
	sort.SliceStable(cat.credOrder, func(i, j int) bool {
		return strings.ToLower(cat.creds[cat.credOrder[i]].DisplayName) < strings.ToLower(cat.creds[cat.credOrder[j]].DisplayName)
	})

	cached = cat

	return cat, nil
}

func latestEntry(entries []n8n.NodeType) n8n.NodeType {
	best := entries[0]
	for _, entry := range entries[1:] {
		if entry.Version.Latest() > best.Version.Latest() {
			best = entry
		}
	}

	return best
}

func entryFor(entries []n8n.NodeType, version float64) (n8n.NodeType, bool) {
	for _, entry := range entries {
		if entry.Version.Contains(version) {
			return entry, true
		}
	}

	return n8n.NodeType{}, false
}

func summarize(name string, entries []n8n.NodeType, latest n8n.NodeType) NodeSummary {
	versions := []float64{}
	seen := map[float64]bool{}
	for _, entry := range entries {
		for _, v := range entry.Version {
			if !seen[v] {
				seen[v] = true
				versions = append(versions, v)
			}
		}
	}
	sort.Float64s(versions)

	defaultVersion := latest.DefaultVersion
	if defaultVersion == 0 {
		defaultVersion = latest.Version.Latest()
	}

	credentials := latest.Credentials
	if credentials == nil {
		credentials = []n8n.NodeCredential{}
	}

	light, dark := iconURLs(latest.IconURL)

	return NodeSummary{
		Name:           name,
		DisplayName:    latest.DisplayName,
		Description:    latest.Description,
		Group:          nonNil(latest.Group),
		Versions:       versions,
		DefaultVersion: defaultVersion,
		Trigger:        isTrigger(latest),
		SubNode:        !hasMainOutput(latest.Outputs),
		Custom:         strings.HasPrefix(name, customNodePrefix),
		Webhook:        hasWebhooks(latest),
		Polling:        latest.Polling,
		Icon:           iconName(latest.Icon),
		IconColor:      optional(latest.IconColor),
		IconURL:        light,
		IconURLDark:    dark,
		Credentials:    credentials,
		Categories:     nonNil(latest.Codex.Categories),
		Subcategories:  latest.Codex.Subcategories,
		AdminOnly:      adminNodes[name],
	}
}

func summarizeCredentialType(cat *catalog, t n8n.CredentialType) CredentialTypeSummary {
	light, dark := iconURLs(t.IconURL)

	return CredentialTypeSummary{
		Name:             t.Name,
		DisplayName:      t.DisplayName,
		DocumentationURL: docsURL(t.DocumentationURL),
		SupportedNodes:   nonNil(t.SupportedNodes),
		OAuth:            isOAuth(cat, t, 0),
		Icon:             iconName(t.Icon),
		IconURL:          light,
		IconURLDark:      dark,
	}
}

func resolveProperties(cat *catalog, t n8n.CredentialType, depth int) []json.RawMessage {
	props := []json.RawMessage{}
	index := map[string]int{}

	add := func(list []json.RawMessage) {
		for _, prop := range list {
			var head struct {
				Name string `json:"name"`
			}
			json.Unmarshal(prop, &head)

			if at, ok := index[head.Name]; ok && head.Name != "" {
				props[at] = prop
				continue
			}
			index[head.Name] = len(props)
			props = append(props, prop)
		}
	}

	if depth < maxExtendsHop {
		for _, parent := range t.Extends {
			if p, ok := cat.creds[parent]; ok {
				add(resolveProperties(cat, p, depth+1))
			}
		}
	}
	add(t.Properties)

	return props
}

func isOAuth(cat *catalog, t n8n.CredentialType, depth int) bool {
	if t.Name == "oAuth2Api" || t.Name == "oAuth1Api" {
		return true
	}
	if depth >= maxExtendsHop {
		return false
	}

	for _, parent := range t.Extends {
		if p, ok := cat.creds[parent]; ok && isOAuth(cat, p, depth+1) {
			return true
		}
	}

	return false
}

func credentialTypeAllowed(t n8n.CredentialType, admin bool) bool {
	if t.Name == HomeCredentialType {
		return false
	}
	if len(t.SupportedNodes) == 0 {
		return true
	}

	for _, node := range t.SupportedNodes {
		if nodeAllowed(node, admin) {
			return true
		}
	}

	return false
}

func isTrigger(t n8n.NodeType) bool {
	for _, g := range t.Group {
		if g == "trigger" {
			return true
		}
	}

	return false
}

func hasMainOutput(raw json.RawMessage) bool {
	var expression string
	if json.Unmarshal(raw, &expression) == nil {
		return true
	}

	var outputs []json.RawMessage
	if json.Unmarshal(raw, &outputs) != nil || len(outputs) == 0 {
		return true
	}

	for _, output := range outputs {
		var name string
		if json.Unmarshal(output, &name) == nil && name == "main" {
			return true
		}

		var typed struct {
			Type string `json:"type"`
		}
		if json.Unmarshal(output, &typed) == nil && typed.Type == "main" {
			return true
		}
	}

	return false
}

func hasWebhooks(t n8n.NodeType) bool {
	raw := bytes.TrimSpace(t.Webhooks)
	return len(raw) > 0 && !bytes.Equal(raw, []byte("null")) && !bytes.Equal(raw, []byte("[]"))
}

func iconURLs(raw json.RawMessage) (*string, *string) {
	var single string
	if json.Unmarshal(raw, &single) == nil {
		return iconURL(single), nil
	}

	var themed struct {
		Light string `json:"light"`
		Dark  string `json:"dark"`
	}
	if json.Unmarshal(raw, &themed) == nil {
		return iconURL(themed.Light), iconURL(themed.Dark)
	}

	return nil, nil
}

func iconURL(path string) *string {
	if !strings.HasPrefix(path, iconPrefix) {
		return nil
	}

	url := iconRoute + strings.TrimPrefix(path, iconPrefix)
	return &url
}

func iconName(raw json.RawMessage) *string {
	var single string
	if json.Unmarshal(raw, &single) == nil && single != "" {
		return &single
	}

	var themed struct {
		Light string `json:"light"`
	}
	if json.Unmarshal(raw, &themed) == nil && themed.Light != "" {
		return &themed.Light
	}

	return nil
}

func docsURL(raw string) *string {
	switch {
	case raw == "":
		return nil
	case strings.HasPrefix(raw, "https://") || strings.HasPrefix(raw, "http://"):
		return &raw
	}

	url := docsPrefix + strings.Trim(raw, "/") + "/"
	return &url
}

func optional(value string) *string {
	if value == "" {
		return nil
	}

	return &value
}

func nonNil[T any](list []T) []T {
	if list == nil {
		return []T{}
	}

	return list
}
