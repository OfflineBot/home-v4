import { useState } from "react";
import { Link, useRevalidator } from "react-router";
import { Badge, Placeholder } from "../block";
import { Icon } from "../icons";
import { NodeChain } from "./node-icon";
import { smallButtonClass, smallDangerClass } from "./notice";
import { useFlash } from "./use-flash";
import {
  automationApi,
  webhookType,
  type IconInfo,
  type WorkflowSummary,
} from "../../lib/automation";
import { formatStamp } from "../../lib/sync";

type WorkflowListProps = {
  workflows: WorkflowSummary[];
  icons: Record<string, IconInfo>;
  disabled: boolean;
};

export function WorkflowList({ workflows, icons, disabled }: WorkflowListProps) {
  if (workflows.length === 0) {
    return (
      <Placeholder
        icon={<Icon name="automation" />}
        hint="No workflows yet. Press New workflow and pick Test run to see n8n answer within seconds."
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-ui-border-soft">
      {workflows.map((workflow) => (
        <WorkflowRow key={workflow.id} workflow={workflow} icons={icons} disabled={disabled} />
      ))}
    </ul>
  );
}

type RowProps = {
  workflow: WorkflowSummary;
  icons: Record<string, IconInfo>;
  disabled: boolean;
};

function WorkflowRow({ workflow, icons, disabled }: RowProps) {
  const revalidator = useRevalidator();
  const { fail, toast } = useFlash();
  const [busy, setBusy] = useState<"toggle" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function toggle() {
    setBusy("toggle");
    const result = workflow.active
      ? await automationApi.deactivate(workflow.id)
      : await automationApi.activate(workflow.id);
    setBusy(null);

    if (result.ok) revalidator.revalidate();
    else fail(result.message);
  }

  async function remove() {
    setBusy("delete");
    const result = await automationApi.deleteWorkflow(workflow.id);
    setBusy(null);
    setConfirming(false);

    if (result.ok) revalidator.revalidate();
    else fail(result.message);
  }

  const chain = workflow.node_types.map((type) => icons[type] ?? null);
  const runnable = workflow.node_types.includes(webhookType);

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
      <Link
        to={`/automation/${workflow.id}`}
        className="group flex min-w-0 flex-1 flex-col gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ui-ring"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-ui-fg group-hover:text-[var(--accent-fg)]">
            {workflow.name}
          </span>
          <Badge tone={workflow.active ? "good" : "neutral"}>
            {workflow.active ? "Active" : "Inactive"}
          </Badge>
          {runnable && <Badge>Webhook</Badge>}
        </span>
        <span className="flex flex-wrap items-center gap-3">
          <NodeChain icons={chain} />
          <span className="text-xs text-ui-fg-faint tabular-nums">
            {workflow.node_count} step{workflow.node_count === 1 ? "" : "s"} · edited{" "}
            {formatStamp(workflow.updated_at)}
          </span>
        </span>
      </Link>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={smallButtonClass}
          disabled={disabled || busy !== null || workflow.node_count === 0}
          onClick={toggle}
        >
          {busy === "toggle" ? "…" : workflow.active ? "Deactivate" : "Activate"}
        </button>
        <Link to={`/automation/${workflow.id}`} className={smallButtonClass}>
          Open
        </Link>
        {confirming ? (
          <button type="button" className={smallDangerClass} disabled={busy !== null} onClick={remove}>
            {busy === "delete" ? "Deleting…" : "Confirm delete"}
          </button>
        ) : (
          <button
            type="button"
            className={smallDangerClass}
            disabled={disabled || busy !== null}
            onClick={() => setConfirming(true)}
          >
            Delete
          </button>
        )}
      </div>
      {toast}
    </li>
  );
}
