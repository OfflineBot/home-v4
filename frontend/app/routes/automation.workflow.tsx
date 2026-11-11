import { useEffect, useMemo, useState } from "react";
import { useBlocker, useNavigate } from "react-router";
import type { Route } from "./+types/automation.workflow";
import { Badge, Block } from "../components/block";
import { ConnectionDialog } from "../components/automation/connection-dialog";
import { JsonPanel } from "../components/automation/json-panel";
import { NodePicker } from "../components/automation/node-picker";
import { Notice } from "../components/automation/notice";
import { RunDialog } from "../components/automation/run-dialog";
import { RunsPanel } from "../components/automation/runs-panel";
import { StepEditor } from "../components/automation/step-editor";
import { StepList, type StepIssue } from "../components/automation/step-list";
import { useFlash } from "../components/automation/use-flash";
import { Dialog } from "../components/dialog";
import { Icon } from "../components/icons";
import { Page } from "../components/page";
import {
  buttonClass,
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
} from "../components/setting-row";
import {
  automationApi,
  chainConnections,
  chainOrder,
  descriptionKey,
  homeCredentialType,
  isChain,
  layoutNodes,
  newId,
  statusMessage,
  uniqueName,
  webhookType,
  type AutomationStatus,
  type Connection,
  type FlowConnections,
  type NodeDescription,
  type NodeSummary,
  type Workflow,
  type WorkflowInput,
  type WorkflowNode,
} from "../lib/automation";
import { nodeCredentials, nodeDefaults, pruneParameters } from "../lib/automation-params";
import { automationGet, readJSON } from "../lib/automation.server";
import { navColor } from "../lib/nav";
import { requireToken } from "../lib/session";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData?.workflow?.name ?? "Workflow" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const id = encodeURIComponent(params.id);

  const [statusRes, workflowRes, connectionRes] = await Promise.all([
    automationGet(token, "/status"),
    automationGet(token, `/workflows/${id}`),
    automationGet(token, "/credentials"),
  ]);

  if (workflowRes.status === 404) throw new Response("Not found", { status: 404 });

  const status = await readJSON<AutomationStatus | null>(statusRes, null);
  const workflow = workflowRes.ok ? ((await workflowRes.json()) as Workflow) : null;
  const connections =
    (await readJSON<{ credentials?: Connection[] }>(connectionRes, {})).credentials ?? [];

  const descriptions: Record<string, NodeDescription> = {};
  if (workflow) {
    const keys = new Map<string, WorkflowNode>();
    for (const node of workflow.nodes) keys.set(descriptionKey(node.type, node.typeVersion), node);

    await Promise.all(
      [...keys.entries()].map(async ([key, node]) => {
        const query = new URLSearchParams({ type: node.type, version: String(node.typeVersion) });
        const res = await automationGet(token, `/nodes/detail?${query}`);
        const description = await readJSON<NodeDescription | null>(res, null);
        if (description) descriptions[key] = description;
      }),
    );
  }

  return { status, workflow, connections, descriptions };
}

export default function AutomationWorkflow({ loaderData }: Route.ComponentProps) {
  const { status, workflow, connections, descriptions } = loaderData;

  if (!workflow) {
    return (
      <Page
        title="Workflow"
        icon="automation"
        color={navColor("automation")}
        back={{ to: "/automation", label: "Automation" }}
      >
        <Notice tone="warn">{statusMessage(status) ?? "The workflow could not be loaded from n8n."}</Notice>
      </Page>
    );
  }

  return (
    <Editor
      key={workflow.id}
      workflow={workflow}
      connections={connections}
      descriptions={descriptions}
    />
  );
}

type Tab = "editor" | "runs" | "json";

const tabs: { id: Tab; label: string }[] = [
  { id: "editor", label: "Steps" },
  { id: "runs", label: "Runs" },
  { id: "json", label: "JSON" },
];

type EditorProps = {
  workflow: Workflow;
  connections: Connection[];
  descriptions: Record<string, NodeDescription>;
};

function renameLinks(connections: FlowConnections, from: string, to: string): FlowConnections {
  const next: FlowConnections = {};
  for (const [source, byType] of Object.entries(connections)) {
    const outputs: FlowConnections[string] = {};
    for (const [kind, lists] of Object.entries(byType)) {
      outputs[kind] = lists.map((list) =>
        (list ?? []).map((link) => (link.node === from ? { ...link, node: to } : link)),
      );
    }
    next[source === from ? to : source] = outputs;
  }
  return next;
}

function Editor({ workflow, connections: initialConnections, descriptions: initialDescriptions }: EditorProps) {
  const navigate = useNavigate();
  const { fail, toast } = useFlash();
  const [name, setName] = useState(workflow.name);
  const [chain, setChain] = useState(() => isChain(workflow.nodes, workflow.connections));
  const [nodes, setNodes] = useState<WorkflowNode[]>(() => chainOrder(workflow.nodes, workflow.connections));
  const [graph, setGraph] = useState<FlowConnections>(workflow.connections ?? {});
  const [settings, setSettings] = useState(workflow.settings);
  const [active, setActive] = useState(workflow.active);
  const [descriptions, setDescriptions] = useState(initialDescriptions);
  const [connections, setConnections] = useState(initialConnections);
  const [selected, setSelected] = useState<string | null>(nodes[0]?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>("editor");
  const [picking, setPicking] = useState(false);
  const [running, setRunning] = useState(false);
  const [runsKey, setRunsKey] = useState(0);
  const [busy, setBusy] = useState<null | "save" | "toggle" | "delete" | "add">(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newConnection, setNewConnection] = useState<{ type: string; node: string } | null>(null);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const selectedNode = nodes.find((node) => node.id === selected) ?? null;
  const runnable = nodes.some((node) => node.type === webhookType && !node.disabled);

  const issues = useMemo(() => {
    const result: Record<string, StepIssue | undefined> = {};
    for (const node of nodes) {
      const description = descriptions[descriptionKey(node.type, node.typeVersion)];
      if (!description) {
        result[node.id] = "description";
        continue;
      }
      const slots = nodeCredentials(description, node.parameters ?? {}, node.typeVersion);
      const missing = slots.some(
        (slot) =>
          slot.name !== homeCredentialType &&
          slot.required !== false &&
          !connections.some((connection) => connection.id === node.credentials?.[slot.name]?.id),
      );
      if (missing && !node.disabled) result[node.id] = "connection";
    }
    return result;
  }, [nodes, descriptions, connections]);

  function touch() {
    setDirty(true);
  }

  function updateNode(id: string, change: (node: WorkflowNode) => WorkflowNode) {
    setNodes((current) => current.map((node) => (node.id === id ? change(node) : node)));
    touch();
  }

  function renameNode(id: string, next: string) {
    const node = nodes.find((entry) => entry.id === id);
    if (!node || node.name === next) return;
    if (!chain) setGraph((current) => renameLinks(current, node.name, next));
    updateNode(id, (entry) => ({ ...entry, name: next }));
  }

  function moveNode(id: string, direction: -1 | 1) {
    setNodes((current) => {
      const index = current.findIndex((node) => node.id === id);
      const target = index + direction;
      if (index < 1 || target < 1 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    touch();
  }

  function removeNode(id: string) {
    const index = nodes.findIndex((node) => node.id === id);
    const next = nodes.filter((node) => node.id !== id);
    setNodes(next);
    if (selected === id) setSelected(next[Math.max(0, index - 1)]?.id ?? null);
    touch();
  }

  async function addNode(summary: NodeSummary) {
    setPicking(false);
    setBusy("add");
    const version = summary.default_version;
    const result = await automationApi.node(summary.name, version);
    setBusy(null);

    if (!result.ok) {
      fail(result.message);
      return;
    }

    const description = result.data;
    const parameters = nodeDefaults(description, version);
    const node: WorkflowNode = {
      id: newId(),
      name: uniqueName(summary.display_name, nodes.map((entry) => entry.name)),
      type: summary.name,
      typeVersion: version,
      position: [nodes.length * 260, 0],
      parameters,
    };

    if (summary.webhook) node.webhookId = newId();
    if (summary.name === webhookType && node.webhookId) {
      node.parameters = { ...parameters, httpMethod: "POST", path: node.webhookId, responseMode: "lastNode" };
    }

    setDescriptions((current) => ({ ...current, [descriptionKey(summary.name, version)]: description }));
    setNodes((current) => [...current, node]);
    setSelected(node.id);
    touch();
  }

  function buildInput(): WorkflowInput {
    const cleaned = nodes.map((node) => {
      const description = descriptions[descriptionKey(node.type, node.typeVersion)];
      return description
        ? { ...node, parameters: pruneParameters(description.properties, node.parameters ?? {}, node.typeVersion) }
        : node;
    });

    return {
      name: name.trim() || workflow.name,
      nodes: chain ? layoutNodes(cleaned) : cleaned,
      connections: chain ? chainConnections(cleaned) : graph,
      settings,
    };
  }

  async function save() {
    setBusy("save");
    const result = await automationApi.saveWorkflow(workflow.id, buildInput());
    setBusy(null);

    if (!result.ok) {
      fail(result.message);
      return false;
    }

    setActive(result.data.active);
    setSettings(result.data.settings);
    setNodes((current) =>
      current.map((node) => {
        const saved = result.data.nodes.find((entry) => entry.id === node.id);
        return saved ? { ...node, webhookId: saved.webhookId, credentials: saved.credentials } : node;
      }),
    );
    setDirty(false);
    return true;
  }

  async function toggleActive() {
    if (dirty && !(await save())) return;

    setBusy("toggle");
    const result = active ? await automationApi.deactivate(workflow.id) : await automationApi.activate(workflow.id);
    setBusy(null);

    if (!result.ok) {
      fail(result.message);
      return;
    }
    setActive(result.data.active);
  }

  async function remove() {
    setBusy("delete");
    const result = await automationApi.deleteWorkflow(workflow.id);
    setBusy(null);

    if (!result.ok) {
      fail(result.message);
      return;
    }
    setDirty(false);
    setConfirmDelete(false);
    navigate("/automation", { replace: true });
  }

  function applyJson(input: WorkflowInput) {
    const ordered = chainOrder(input.nodes, input.connections);
    setName(input.name);
    setNodes(ordered);
    setGraph(input.connections);
    setChain(isChain(input.nodes, input.connections));
    if (input.settings) setSettings(input.settings);
    setSelected(ordered[0]?.id ?? null);
    touch();
    setTab("editor");

    const missing = input.nodes.filter((node) => !descriptions[descriptionKey(node.type, node.typeVersion)]);
    for (const node of missing) {
      automationApi.node(node.type, node.typeVersion).then((result) => {
        if (result.ok) {
          setDescriptions((current) => ({
            ...current,
            [descriptionKey(node.type, node.typeVersion)]: result.data,
          }));
        }
      });
    }
  }

  const runTitle = !runnable
    ? "Only workflows that start with a webhook can be run from here"
    : !active
      ? "Activate the workflow to run it"
      : dirty
        ? "Save your changes first"
        : "Send data to the webhook and see the answer";

  return (
    <Page
      title={name.trim() || workflow.name}
      icon="automation"
      color={navColor("automation")}
      back={{ to: "/automation", label: "Automation" }}
      actions={
        <>
          <span className="hidden sm:inline-flex">
            <Badge tone={active ? "good" : "neutral"}>{active ? "Active" : "Inactive"}</Badge>
          </span>
          {dirty && (
            <span className="hidden md:inline-flex">
              <Badge tone="accent">Unsaved</Badge>
            </span>
          )}
          {runnable && (
            <button
              type="button"
              className={`${buttonClass} inline-flex items-center gap-2`}
              disabled={!active || dirty}
              title={runTitle}
              onClick={() => setRunning(true)}
            >
              <Icon name="forward" className="size-4" />
              Run
            </button>
          )}
          <button
            type="button"
            className={buttonClass}
            disabled={busy !== null || nodes.length === 0}
            onClick={toggleActive}
          >
            {busy === "toggle" ? "…" : active ? "Deactivate" : dirty ? "Save and activate" : "Activate"}
          </button>
          <button type="button" className={primaryButtonClass} disabled={!dirty || busy !== null} onClick={save}>
            {busy === "save" ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Workflow views" className="flex rounded-lg border border-ui-border-soft bg-ui-surface p-0.5">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                onClick={() => setTab(entry.id)}
                className={`h-8 cursor-pointer rounded-md px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ui-ring ${
                  tab === entry.id ? "bg-ui-raised text-ui-fg shadow-sm" : "text-ui-fg-muted hover:text-ui-fg"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
          {busy === "add" && <span className="text-xs text-ui-fg-muted">Loading step…</span>}
        </div>

        {tab === "editor" && (
          <>
            {!chain && (
              <Notice tone="warn">
                This workflow has branches. You can edit every step here, but adding, removing and reordering steps only works in the JSON tab.
              </Notice>
            )}
            {active && runnable && !dirty && (
              <Notice tone="good">This workflow is active. Press Run at the top to try it.</Notice>
            )}

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
              <Block title="Flow">
                <div className="flex flex-col gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-ui-fg-muted">Workflow name</span>
                    <input
                      className={inputClass}
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        touch();
                      }}
                    />
                  </label>
                  <StepList
                    nodes={nodes}
                    descriptions={descriptions}
                    issues={issues}
                    selected={selected}
                    editable={chain}
                    onSelect={setSelected}
                    onMove={moveNode}
                    onRemove={removeNode}
                    onAdd={() => setPicking(true)}
                  />
                </div>
              </Block>

              <Block title={selectedNode ? selectedNode.name : "Step"}>
                {selectedNode ? (
                  <StepEditor
                    key={selectedNode.id}
                    node={selectedNode}
                    description={descriptions[descriptionKey(selectedNode.type, selectedNode.typeVersion)]}
                    first={nodes[0]?.id === selectedNode.id}
                    connections={connections}
                    nameTaken={(candidate) => nodes.some((node) => node.id !== selectedNode.id && node.name === candidate)}
                    onChange={(change) => updateNode(selectedNode.id, change)}
                    onRename={(next) => renameNode(selectedNode.id, next)}
                    onNewConnection={(type) => setNewConnection({ type, node: selectedNode.id })}
                  />
                ) : (
                  <p className="text-sm text-ui-fg-muted">
                    {nodes.length === 0
                      ? "Start by choosing what triggers this workflow."
                      : "Pick a step on the left to edit it."}
                  </p>
                )}
              </Block>
            </div>

            <Block title="Danger zone">
              <div className="flex flex-wrap items-center gap-3">
                <p className="min-w-0 flex-1 text-sm text-ui-fg-muted">
                  Deleting removes the workflow and its run history from n8n. Connections stay.
                </p>
                {confirmDelete ? (
                  <>
                    <button type="button" className={buttonClass} onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </button>
                    <button type="button" className={dangerButtonClass} disabled={busy !== null} onClick={remove}>
                      {busy === "delete" ? "Deleting…" : "Delete for good"}
                    </button>
                  </>
                ) : (
                  <button type="button" className={dangerButtonClass} onClick={() => setConfirmDelete(true)}>
                    Delete workflow
                  </button>
                )}
              </div>
            </Block>
          </>
        )}

        {tab === "runs" && <RunsPanel workflowId={workflow.id} refreshKey={runsKey} />}

        {tab === "json" && <JsonPanel value={buildInput()} onApply={applyJson} />}
      </div>

      <NodePicker
        open={picking}
        triggers={nodes.length === 0}
        onClose={() => setPicking(false)}
        onPick={addNode}
      />

      <RunDialog
        open={running}
        workflowId={workflow.id}
        onClose={() => setRunning(false)}
        onRan={() => setRunsKey((key) => key + 1)}
      />

      <ConnectionDialog
        open={newConnection !== null}
        presetType={newConnection?.type}
        onClose={() => setNewConnection(null)}
        onSaved={(connection) => {
          setConnections((current) => [
            ...current.filter((entry) => entry.id !== connection.id),
            connection,
          ]);
          const target = newConnection;
          if (target) {
            updateNode(target.node, (node) => ({
              ...node,
              credentials: { ...(node.credentials ?? {}), [target.type]: { id: connection.id, name: connection.name } },
            }));
          }
        }}
      />

      <Dialog open={blocker.state === "blocked"} title="Discard changes?" onClose={() => blocker.reset?.()}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ui-fg-muted">This workflow has unsaved changes.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonClass} onClick={() => blocker.reset?.()}>
              Stay
            </button>
            <button type="button" className={dangerButtonClass} onClick={() => blocker.proceed?.()}>
              Discard
            </button>
          </div>
        </div>
      </Dialog>

      {toast}
    </Page>
  );
}
