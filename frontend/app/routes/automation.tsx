import { useState } from "react";
import type { Route } from "./+types/automation";
import { Badge, Block, Stack, Stat } from "../components/block";
import { ConnectionList } from "../components/automation/connection-list";
import { NewWorkflowDialog } from "../components/automation/new-workflow-dialog";
import { Notice } from "../components/automation/notice";
import { WorkflowList } from "../components/automation/workflow-list";
import { Icon } from "../components/icons";
import { Page } from "../components/page";
import { primaryButtonClass } from "../components/setting-row";
import {
  credentialIconInfo,
  nodeIconInfo,
  statusMessage,
  type AutomationStatus,
  type Connection,
  type CredentialTypeSummary,
  type IconInfo,
  type NodeSummary,
  type WorkflowSummary,
} from "../lib/automation";
import { automationGet, readJSON } from "../lib/automation.server";
import { navColor } from "../lib/nav";
import { requireToken } from "../lib/session";

export function meta() {
  return [{ title: "Automation" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const status = await readJSON<AutomationStatus | null>(
    await automationGet(token, "/status"),
    null,
  );
  const ready = status?.ready === true;

  const [workflowRes, connectionRes, nodeRes, typeRes] = await Promise.all([
    ready ? automationGet(token, "/workflows") : null,
    automationGet(token, "/credentials"),
    ready ? automationGet(token, "/nodes") : null,
    ready ? automationGet(token, "/credential-types") : null,
  ]);

  const workflows = workflowRes
    ? (await readJSON<{ workflows?: WorkflowSummary[] }>(workflowRes, {})).workflows ?? []
    : [];
  const connections =
    (await readJSON<{ credentials?: Connection[] }>(connectionRes, {})).credentials ?? [];
  const nodes = nodeRes ? (await readJSON<{ nodes?: NodeSummary[] }>(nodeRes, {})).nodes ?? [] : [];
  const types = typeRes
    ? (await readJSON<{ types?: CredentialTypeSummary[] }>(typeRes, {})).types ?? []
    : [];

  const usedNodes = new Set(workflows.flatMap((workflow) => workflow.node_types));
  const usedTypes = new Set(connections.map((connection) => connection.type));

  const icons: Record<string, IconInfo> = {};
  for (const node of nodes) {
    if (usedNodes.has(node.name)) icons[node.name] = nodeIconInfo(node);
  }

  const typeIcons: Record<string, IconInfo> = {};
  for (const type of types) {
    if (usedTypes.has(type.name)) typeIcons[type.name] = credentialIconInfo(type);
  }

  return {
    status,
    workflows,
    connections,
    icons,
    typeIcons,
    loadFailed: ready && workflowRes !== null && !workflowRes.ok,
  };
}

export default function Automation({ loaderData }: Route.ComponentProps) {
  const { status, workflows, connections, icons, typeIcons, loadFailed } = loaderData;
  const [creating, setCreating] = useState(false);
  const ready = status?.ready === true;
  const message = statusMessage(status);

  return (
    <Page
      title="Automation"
      icon="automation"
      color={navColor("automation")}
      actions={
        <button
          type="button"
          className={`${primaryButtonClass} inline-flex items-center gap-2`}
          disabled={!ready}
          onClick={() => setCreating(true)}
        >
          <Icon name="plus" className="size-4" />
          New workflow
        </button>
      }
    >
      <Stack>
        {message && <Notice tone="warn">{message}</Notice>}
        {loadFailed && <Notice tone="bad">The workflows could not be loaded from n8n.</Notice>}

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Workflows" value={String(workflows.length)} />
          <Stat label="Active" value={String(workflows.filter((workflow) => workflow.active).length)} />
          <Stat label="Connections" value={String(connections.length)} />
        </div>

        <Block
          title="Workflows"
          status={
            ready && status?.version ? (
              <span className="ml-auto">
                <Badge>n8n {status.version}</Badge>
              </span>
            ) : null
          }
        >
          <WorkflowList workflows={workflows} icons={icons} disabled={!ready} />
        </Block>

        <Block title="Connections">
          <p className="mb-4 text-sm text-ui-fg-muted">
            Keys and logins for the services your workflows use. They are stored encrypted inside n8n and are never shown again.
          </p>
          <ConnectionList connections={connections} types={typeIcons} disabled={!ready} />
        </Block>
      </Stack>

      <NewWorkflowDialog open={creating} onClose={() => setCreating(false)} />
    </Page>
  );
}
