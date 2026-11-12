export type AutomationStatus = {
  enabled: boolean;
  ready: boolean;
  error: string | null;
  version: string | null;
  checked_at: string | null;
};

export type NodeCredential = { name: string; required: boolean };

export type NodeSummary = {
  name: string;
  display_name: string;
  description: string;
  group: string[];
  versions: number[];
  default_version: number;
  trigger: boolean;
  sub_node: boolean;
  custom: boolean;
  webhook: boolean;
  polling: boolean;
  icon: string | null;
  icon_color: string | null;
  icon_url: string | null;
  icon_url_dark: string | null;
  credentials: NodeCredential[];
  categories: string[];
  admin_only: boolean;
};

export type CredentialTypeSummary = {
  name: string;
  display_name: string;
  documentation_url: string | null;
  supported_nodes: string[];
  oauth: boolean;
  icon: string | null;
  icon_url: string | null;
  icon_url_dark: string | null;
};

export type PropertyOption = {
  name: string;
  value: unknown;
  description?: string;
};

export type CollectionGroup = {
  name: string;
  displayName: string;
  values: NodeProperty[];
};

export type LocatorMode = {
  name: string;
  displayName: string;
  type?: string;
  placeholder?: string;
};

export type DisplayCondition = Record<string, unknown[]>;

export type DisplayOptions = {
  show?: DisplayCondition;
  hide?: DisplayCondition;
};

export type NodeProperty = {
  displayName: string;
  name: string;
  type: string;
  default?: unknown;
  description?: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  isNodeSetting?: boolean;
  noDataExpression?: boolean;
  displayOptions?: DisplayOptions;
  typeOptions?: Record<string, unknown>;
  options?: (PropertyOption | NodeProperty | CollectionGroup)[];
  modes?: LocatorMode[];
};

export type CredentialTypeDetail = CredentialTypeSummary & {
  properties: NodeProperty[];
};

export type NodeDescription = {
  name: string;
  displayName: string;
  description?: string;
  group?: string[];
  version: number | number[];
  defaultVersion?: number;
  icon?: string | { light?: string; dark?: string };
  iconUrl?: string | { light?: string; dark?: string };
  iconColor?: string;
  properties: NodeProperty[];
  credentials?: {
    name: string;
    required?: boolean;
    displayOptions?: DisplayOptions;
  }[];
  webhooks?: unknown[];
  codex?: {
    resources?: { primaryDocumentation?: { url: string }[] };
  };
};

export type Connection = {
  id: string;
  name: string;
  type: string;
  created_at: string;
  updated_at: string;
};

export type CredentialRef = { id: string; name: string };

export type WorkflowNode = {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, CredentialRef>;
  webhookId?: string;
  disabled?: boolean;
  notes?: string;
  executeOnce?: boolean;
  alwaysOutputData?: boolean;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  onError?: string;
};

export type WorkflowSettings = Record<string, unknown>;

export type FlowLink = { node: string; type: string; index: number };

export type FlowConnections = Record<string, Record<string, FlowLink[][]>>;

export type Workflow = {
  id: string;
  name: string;
  active: boolean;
  nodes: WorkflowNode[];
  connections: FlowConnections;
  settings: WorkflowSettings;
  created_at: string;
  updated_at: string;
};

export type WorkflowSummary = {
  id: string;
  name: string;
  active: boolean;
  node_count: number;
  node_types: string[];
  created_at: string;
  updated_at: string;
};

export type WorkflowInput = {
  name: string;
  nodes: WorkflowNode[];
  connections: FlowConnections;
  settings?: WorkflowSettings;
};

export type Execution = {
  id: string;
  workflow_id: string;
  mode: string;
  status: string;
  finished: boolean;
  retry_of: string | null;
  started_at: string | null;
  stopped_at: string | null;
  wait_till: string | null;
  data?: ExecutionData;
};

export type NodeRun = {
  startTime?: number;
  executionTime?: number;
  executionStatus?: string;
  error?: { message?: string; description?: string };
  data?: { main?: ({ json?: unknown }[] | null)[] };
};

export type ExecutionData = {
  resultData?: {
    runData?: Record<string, NodeRun[]>;
    error?: { message?: string; description?: string; node?: { name?: string } };
    lastNodeExecuted?: string;
  };
};

export type ExecutionPage = {
  executions: Execution[];
  next_cursor: string | null;
};

export type RunResult = {
  status: number;
  content_type: string;
  json: unknown;
  text: string | null;
  truncated: boolean;
};

export type CredentialTest = { ok: boolean; message: string };

export type IconInfo = {
  label: string;
  url: string | null;
  icon: string | null;
  color: string | null;
};

export const webhookType = "n8n-nodes-base.webhook";
export const homeCredentialType = "homeV4Api";
export const homeNodePrefix = "CUSTOM.homeV4";

export function isHomeNode(type: string) {
  return type.startsWith(homeNodePrefix);
}

export const hiddenTriggers = new Set([
  "n8n-nodes-base.manualTrigger",
  "n8n-nodes-base.executeWorkflowTrigger",
  "n8n-nodes-base.start",
]);

const iconPrefix = "/api/automation/icons/";
const rawIconPrefix = "icons/";
export const iconRoute = "/automation/icons/";

export function iconHref(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith(iconPrefix)) return iconRoute + url.slice(iconPrefix.length);
  if (url.startsWith(rawIconPrefix)) return iconRoute + url.slice(rawIconPrefix.length);
  return null;
}

export function nodeIconInfo(summary: NodeSummary): IconInfo {
  return {
    label: summary.display_name,
    url: iconHref(summary.icon_url),
    icon: summary.icon,
    color: summary.icon_color,
  };
}

export function descriptionIconInfo(description: NodeDescription): IconInfo {
  const raw = description.iconUrl;
  const url = typeof raw === "string" ? raw : (raw?.light ?? null);
  const icon = description.icon;

  return {
    label: description.displayName,
    url: iconHref(url),
    icon: typeof icon === "string" ? icon : (icon?.light ?? null),
    color: description.iconColor ?? null,
  };
}

export function credentialIconInfo(type: CredentialTypeSummary): IconInfo {
  return {
    label: type.display_name,
    url: iconHref(type.icon_url),
    icon: type.icon,
    color: null,
  };
}

export function versionsOf(description: NodeDescription) {
  return Array.isArray(description.version)
    ? description.version
    : [description.version];
}

export function descriptionKey(type: string, version: number) {
  return `${type}@${version}`;
}

export function docsLink(description: NodeDescription) {
  return description.codex?.resources?.primaryDocumentation?.[0]?.url ?? null;
}

const statusMessages: Record<string, string> = {
  starting: "n8n is starting. This takes up to a minute after a restart.",
  reconnecting: "The connection to n8n was lost. Reconnecting…",
  unreachable: "n8n is not reachable. Check that the n8n container is running.",
  unclaimed:
    "n8n already has an owner this server does not know. Reset the n8n volume to let the backend set it up again.",
  setup_failed: "Setting up n8n failed. Check the backend logs.",
};

export function statusMessage(status: AutomationStatus | null) {
  if (!status) return "The backend is not reachable.";
  if (!status.enabled) return "Automation is not configured on this server.";
  if (status.ready) return null;
  return statusMessages[status.error ?? ""] ?? "n8n is not ready yet.";
}

const fieldMessages: Record<string, string> = {
  name: "Give it a name with at most 128 characters.",
  nodes: "This workflow has too many steps.",
  "nodes.name": "Every step needs a unique name.",
  "nodes.id": "Two steps share the same id.",
  "nodes.type": "This step type is not available.",
  "nodes.typeVersion": "This step version is not supported.",
  "nodes.parameters": "The step settings are not valid.",
  "nodes.options": "The retry or error settings are not valid.",
  "nodes.credentials": "Pick a connection for this step.",
  connections: "The steps are not connected correctly.",
  data: "Fill in the connection fields.",
  type: "This connection type is not available.",
  body: "Nothing to change.",
};

const errorMessages: Record<string, string> = {
  disabled: "Automation is not configured on this server.",
  unavailable: "n8n is not reachable right now. Try again in a moment.",
  not_found: "Not found. It may have been deleted.",
  invalid_body: "The request was not valid.",
  invalid_query: "The request was not valid.",
  unknown_node: "This step type does not exist.",
  blocked_node: "This step type is not allowed for your account.",
  unknown_credential: "A step uses a connection that no longer exists.",
  credential_type_mismatch: "A step uses a connection of the wrong type.",
  credential_in_use: "This connection is still used by a workflow.",
  limit_reached: "You reached the limit of 100.",
  upstream_failed: "n8n returned an error.",
  not_active: "Activate the workflow first.",
  no_webhook: "Only workflows that start with a webhook can be run from here.",
  dynamic_path: "Webhook paths with :parameters can not be run from here.",
  too_many_attempts: "Too many attempts. Wait a minute and try again.",
  unknown_action: "Unknown action.",
  unreachable: "The backend is not reachable.",
};

export type ApiError = {
  error?: string;
  message?: string;
  field?: string | null;
  node?: string | null;
  workflows?: string[];
};

export function automationError(data: ApiError, status: number) {
  const code = data.error ?? "";

  if (code === "rejected") return data.message || "n8n rejected the request.";
  if (code === "invalid_workflow" || code === "invalid_credential") {
    const text = fieldMessages[data.field ?? ""] ?? "Some values are not valid.";
    return data.node ? `${data.node}: ${text}` : text;
  }
  if (errorMessages[code]) {
    const text = errorMessages[code];
    return data.node ? `${data.node}: ${text}` : text;
  }
  if (status === 503) return errorMessages.unavailable;
  return "Something went wrong.";
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; error: ApiError };

const endpoint = "/automation/api";

async function settle<T>(res: Response | null): Promise<Result<T>> {
  if (!res) {
    return {
      ok: false,
      status: 0,
      message: errorMessages.unreachable,
      error: { error: "unreachable" },
    };
  }

  const data = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, data: data as T };

  return {
    ok: false,
    status: res.status,
    message: automationError(data as ApiError, res.status),
    error: data as ApiError,
  };
}

function get<T>(query: Record<string, string>) {
  return fetch(`${endpoint}?${new URLSearchParams(query)}`)
    .catch(() => null)
    .then(settle<T>);
}

function send<T>(body: Record<string, unknown>) {
  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
    .catch(() => null)
    .then(settle<T>);
}

const nodeCache = new Map<string, Promise<Result<NodeDescription>>>();
let nodeList: Promise<Result<{ nodes: NodeSummary[] }>> | null = null;
let credentialTypeList: Promise<
  Result<{ types: CredentialTypeSummary[] }>
> | null = null;

function remember<T>(promise: Promise<Result<T>>, drop: () => void) {
  promise.then((result) => {
    if (!result.ok) drop();
  });
  return promise;
}

export const automationApi = {
  nodes() {
    nodeList ??= remember(get<{ nodes: NodeSummary[] }>({ kind: "nodes" }), () => {
      nodeList = null;
    });
    return nodeList;
  },
  node(type: string, version: number) {
    const key = descriptionKey(type, version);
    const cached = nodeCache.get(key);
    if (cached) return cached;

    const promise = remember(
      get<NodeDescription>({ kind: "node", type, version: String(version) }),
      () => nodeCache.delete(key),
    );
    nodeCache.set(key, promise);
    return promise;
  },
  credentialTypes() {
    credentialTypeList ??= remember(
      get<{ types: CredentialTypeSummary[] }>({ kind: "credential-types" }),
      () => {
        credentialTypeList = null;
      },
    );
    return credentialTypeList;
  },
  credentialType: (type: string) =>
    get<CredentialTypeDetail>({ kind: "credential-type", type }),
  connections: () => get<{ credentials: Connection[] }>({ kind: "credentials" }),
  homeOptions: (method: string, params: Record<string, string>) =>
    get<{ options: PropertyOption[] }>({ kind: "home-options", method, ...params }),
  executions: (workflow: string, cursor?: string) =>
    get<ExecutionPage>({
      kind: "executions",
      workflow,
      ...(cursor ? { cursor } : {}),
    }),
  execution: (id: string) => get<Execution>({ kind: "execution", id }),
  createConnection: (name: string, type: string, data: Record<string, unknown>) =>
    send<Connection>({ intent: "create-connection", name, type, data }),
  updateConnection: (
    id: string,
    change: { name?: string; data?: Record<string, unknown> },
  ) => send<Connection>({ intent: "update-connection", id, ...change }),
  deleteConnection: (id: string) =>
    send<Record<string, never>>({ intent: "delete-connection", id }),
  testConnection: (id: string) =>
    send<CredentialTest>({ intent: "test-connection", id }),
  createWorkflow: (input: WorkflowInput) =>
    send<Workflow>({ intent: "create-workflow", workflow: input }),
  saveWorkflow: (id: string, input: WorkflowInput) =>
    send<Workflow>({ intent: "save-workflow", id, workflow: input }),
  activate: (id: string) => send<Workflow>({ intent: "activate", id }),
  deactivate: (id: string) => send<Workflow>({ intent: "deactivate", id }),
  deleteWorkflow: (id: string) =>
    send<Record<string, never>>({ intent: "delete-workflow", id }),
  run: (id: string, payload: unknown) =>
    send<RunResult>({ intent: "run", id, payload }),
};

export function newId() {
  return crypto.randomUUID();
}

export function uniqueName(base: string, taken: string[]) {
  const names = new Set(taken);
  if (!names.has(base)) return base;

  for (let i = 1; ; i++) {
    const candidate = `${base} ${i}`;
    if (!names.has(candidate)) return candidate;
  }
}

export function isChain(nodes: WorkflowNode[], connections: FlowConnections) {
  if (nodes.length <= 1) return true;

  const names = new Set(nodes.map((node) => node.name));
  const incoming = new Map<string, number>();
  const next = new Map<string, string>();

  for (const [source, byType] of Object.entries(connections ?? {})) {
    if (!names.has(source)) return false;

    for (const [kind, outputs] of Object.entries(byType)) {
      const links = outputs.flatMap((list, index) =>
        (list ?? []).map((link) => ({ ...link, output: index })),
      );
      if (links.length === 0) continue;
      if (kind !== "main" || links.length > 1 || links[0].output !== 0) {
        return false;
      }

      const target = links[0].node;
      if (!names.has(target) || links[0].index !== 0) return false;
      next.set(source, target);
      incoming.set(target, (incoming.get(target) ?? 0) + 1);
    }
  }

  const starts = nodes.filter((node) => !incoming.has(node.name));
  if (starts.length !== 1) return false;
  if ([...incoming.values()].some((count) => count > 1)) return false;

  const seen = new Set<string>();
  let current: string | undefined = starts[0].name;
  while (current && !seen.has(current)) {
    seen.add(current);
    current = next.get(current);
  }

  return seen.size === nodes.length;
}

export function chainOrder(nodes: WorkflowNode[], connections: FlowConnections) {
  if (!isChain(nodes, connections) || nodes.length <= 1) return nodes;

  const byName = new Map(nodes.map((node) => [node.name, node]));
  const targets = new Set<string>();
  for (const byType of Object.values(connections)) {
    for (const link of byType.main?.[0] ?? []) targets.add(link.node);
  }

  const ordered: WorkflowNode[] = [];
  let current = nodes.find((node) => !targets.has(node.name));
  while (current) {
    ordered.push(current);
    const link: FlowLink | undefined = connections[current.name]?.main?.[0]?.[0];
    current = link ? byName.get(link.node) : undefined;
  }

  return ordered;
}

export function chainConnections(nodes: WorkflowNode[]): FlowConnections {
  const connections: FlowConnections = {};

  nodes.forEach((node, index) => {
    const target = nodes[index + 1];
    if (!target) return;
    connections[node.name] = {
      main: [[{ node: target.name, type: "main", index: 0 }]],
    };
  });

  return connections;
}

export function layoutNodes(nodes: WorkflowNode[]) {
  return nodes.map((node, index) => ({
    ...node,
    position: [index * 260, 0] as [number, number],
  }));
}

export type Template = {
  id: string;
  title: string;
  description: string;
  build: () => WorkflowNode[];
};

function webhookNode(responseMode: string): WorkflowNode {
  const id = newId();
  return {
    id: newId(),
    name: "Webhook",
    type: webhookType,
    typeVersion: 2,
    position: [0, 0],
    webhookId: id,
    parameters: { httpMethod: "POST", path: id, responseMode, options: {} },
  };
}

export const templates: Template[] = [
  {
    id: "webhook",
    title: "Webhook",
    description: "Starts when you press Run. The answer is the output of the last step.",
    build: () => [webhookNode("lastNode")],
  },
  {
    id: "schedule",
    title: "Schedule",
    description: "Runs on its own, every hour by default.",
    build: () => [
      {
        id: newId(),
        name: "Schedule",
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1.2,
        position: [0, 0],
        parameters: { rule: { interval: [{ field: "hours", hoursInterval: 1 }] } },
      },
    ],
  },
  {
    id: "uni-morning",
    title: "Before the first lecture",
    description:
      "45 minutes before your first lecture: wake your PC and turn on a light. Pick the machine and light, then activate.",
    build: () => [
      {
        id: newId(),
        name: "First lecture",
        type: "CUSTOM.homeV4TimetableTrigger",
        typeVersion: 1,
        position: [0, 0],
        parameters: {
          pollTimes: { item: [{ mode: "everyMinute" }] },
          moment: "beforeFirst",
          minutes: 45,
          source: "timetable",
        },
      },
      {
        id: newId(),
        name: "Wake PC",
        type: "CUSTOM.homeV4Machine",
        typeVersion: 1,
        position: [260, 0],
        parameters: { operation: "wake" },
      },
      {
        id: newId(),
        name: "Light on",
        type: "CUSTOM.homeV4Lights",
        typeVersion: 1,
        position: [520, 0],
        parameters: { operation: "on", brightness: 80 },
      },
    ],
  },
  {
    id: "grade-notify",
    title: "A grade lands on your phone",
    description:
      "When Dualis has a new grade, send it to the app. Edit the title and the text to taste.",
    build: () => [
      {
        id: newId(),
        name: "New grade",
        type: "CUSTOM.homeV4GradeTrigger",
        typeVersion: 1,
        position: [0, 0],
        parameters: {
          pollTimes: { item: [{ mode: "everyHour", minute: 5 }] },
          moment: "graded",
          semester: "",
        },
      },
      {
        id: newId(),
        name: "Notify",
        type: "CUSTOM.homeV4Notify",
        typeVersion: 1,
        position: [260, 0],
        parameters: {
          title: "=New grade: {{ $json.name }}",
          message: "={{ $json.grade }} · {{ $json.ects }} ECTS · {{ $json.semester }}",
          link: "/grades",
        },
      },
    ],
  },
  {
    id: "empty",
    title: "Empty",
    description: "Pick the trigger yourself.",
    build: () => [],
  },
];

const statusTones: Record<string, "good" | "bad" | "neutral" | "accent"> = {
  success: "good",
  error: "bad",
  crashed: "bad",
  canceled: "neutral",
  running: "accent",
  waiting: "accent",
  new: "neutral",
};

export function executionTone(status: string) {
  return statusTones[status] ?? "neutral";
}

const statusLabels: Record<string, string> = {
  success: "Success",
  error: "Failed",
  crashed: "Crashed",
  canceled: "Canceled",
  running: "Running",
  waiting: "Waiting",
  new: "Queued",
};

export function executionLabel(status: string) {
  return statusLabels[status] ?? status;
}

export function duration(start: string | null, stop: string | null) {
  if (!start || !stop) return null;

  const ms = new Date(stop).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

export function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}
