import { useCallback, useEffect, useState } from "react";
import { Badge, Block, Placeholder } from "../block";
import { Icon } from "../icons";
import { Notice, smallButtonClass } from "./notice";
import {
  automationApi,
  duration,
  executionLabel,
  executionTone,
  pretty,
  type Execution,
  type NodeRun,
} from "../../lib/automation";
import { formatStamp } from "../../lib/sync";

type RunsPanelProps = {
  workflowId: string;
  refreshKey: number;
};

const shownItems = 20;
const pollMs = 3000;

export function RunsPanel({ workflowId, refreshKey }: RunsPanelProps) {
  const [executions, setExecutions] = useState<Execution[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await automationApi.executions(workflowId);
    setLoading(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    setExecutions(result.data.executions);
    setCursor(result.data.next_cursor);
    setSelected((current) => current ?? result.data.executions[0]?.id ?? null);
  }, [workflowId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const running = executions?.some((execution) => execution.status === "running" || execution.status === "new");
  useEffect(() => {
    if (!running) return;
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [running, load]);

  async function more() {
    if (!cursor) return;
    const result = await automationApi.executions(workflowId, cursor);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setExecutions((current) => [...(current ?? []), ...result.data.executions]);
    setCursor(result.data.next_cursor);
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <Block
        title="Runs"
        status={
          <button type="button" className={`${smallButtonClass} ml-auto`} onClick={load} disabled={loading}>
            <Icon name="sync" className={`size-3.5 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} />
            Refresh
          </button>
        }
      >
        {error && <Notice tone="bad">{error}</Notice>}
        {executions && executions.length === 0 && (
          <Placeholder
            icon={<Icon name="sync" />}
            hint="No runs yet. Active workflows show every run here, also scheduled ones."
          />
        )}
        {executions && executions.length > 0 && (
          <ul className="-mx-2 flex flex-col">
            {executions.map((execution) => (
              <li key={execution.id}>
                <button
                  type="button"
                  onClick={() => setSelected(execution.id)}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ui-ring ${
                    selected === execution.id ? "bg-ui-hover" : "hover:bg-ui-hover"
                  }`}
                >
                  <Badge tone={executionTone(execution.status)}>{executionLabel(execution.status)}</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ui-fg tabular-nums">
                      {execution.started_at ? formatStamp(execution.started_at) : "Not started"}
                    </span>
                    <span className="block truncate text-xs text-ui-fg-muted">
                      {execution.mode}
                      {duration(execution.started_at, execution.stopped_at)
                        ? ` · ${duration(execution.started_at, execution.stopped_at)}`
                        : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {cursor && (
          <button type="button" className={`${smallButtonClass} mt-3`} onClick={more}>
            Load older runs
          </button>
        )}
      </Block>

      {selected ? (
        <ExecutionDetail key={selected} id={selected} />
      ) : (
        <Block title="Details">
          <p className="text-sm text-ui-fg-muted">Pick a run to see what every step produced.</p>
        </Block>
      )}
    </div>
  );
}

function ExecutionDetail({ id }: { id: string }) {
  const [execution, setExecution] = useState<Execution | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    automationApi.execution(id).then((result) => {
      if (result.ok) setExecution(result.data);
      else setError(result.message);
    });
  }, [id]);

  if (error) {
    return (
      <Block title="Details">
        <Notice tone="bad">{error}</Notice>
      </Block>
    );
  }
  if (!execution) {
    return (
      <Block title="Details">
        <p className="text-sm text-ui-fg-muted">Loading…</p>
      </Block>
    );
  }

  const result = execution.data?.resultData;
  const steps = Object.entries(result?.runData ?? {})
    .map(([name, runs]) => ({ name, run: runs[runs.length - 1] as NodeRun | undefined }))
    .sort((a, b) => (a.run?.startTime ?? 0) - (b.run?.startTime ?? 0));

  return (
    <Block
      title={`Run ${execution.id}`}
      status={<Badge tone={executionTone(execution.status)}>{executionLabel(execution.status)}</Badge>}
    >
      <div className="flex flex-col gap-3">
        {result?.error?.message && (
          <Notice tone="bad">
            {result.error.node?.name ? `${result.error.node.name}: ` : ""}
            {result.error.message}
            {result.error.description ? `\n${result.error.description}` : ""}
          </Notice>
        )}
        {steps.length === 0 && <p className="text-sm text-ui-fg-muted">This run has no step data.</p>}
        {steps.map(({ name, run }) => (
          <StepOutput key={name} name={name} run={run} />
        ))}
      </div>
    </Block>
  );
}

function StepOutput({ name, run }: { name: string; run: NodeRun | undefined }) {
  const [open, setOpen] = useState(false);
  const items = (run?.data?.main ?? []).flatMap((output) => output ?? []);
  const failed = run?.executionStatus === "error" || Boolean(run?.error);

  return (
    <div className="rounded-lg border border-ui-border-soft bg-ui-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ui-ring"
      >
        <span className={`grid size-5 place-items-center ${failed ? "text-ui-danger" : "text-ctp-green"}`}>
          <Icon name={failed ? "alert" : "check"} className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ui-fg">{name}</span>
        <span className="text-xs text-ui-fg-muted tabular-nums">
          {items.length} item{items.length === 1 ? "" : "s"}
          {typeof run?.executionTime === "number" ? ` · ${run.executionTime} ms` : ""}
        </span>
        <Icon name="chevron" className={`size-4 text-ui-fg-faint transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-ui-border-soft p-3">
          {run?.error?.message && <Notice tone="bad">{run.error.message}</Notice>}
          {items.length > 0 && (
            <pre className="max-h-96 overflow-auto rounded-md bg-ui-field p-3 font-mono text-xs leading-relaxed text-ui-fg">
              {pretty(items.slice(0, shownItems).map((item) => item.json))}
            </pre>
          )}
          {items.length > shownItems && (
            <p className="mt-2 text-xs text-ui-fg-faint">Showing {shownItems} of {items.length} items.</p>
          )}
        </div>
      )}
    </div>
  );
}
