import type { Route } from "./+types/sync";
import { Badge, Block, Stack } from "../../components/block";
import { buttonClass } from "../../components/setting-row";
import {
  useSubmission,
  type ActionResult,
} from "../../components/use-submission";
import { api, unreachableStatus } from "../../lib/api";
import { requireToken } from "../../lib/session";
import {
  formatStamp,
  isSyncJob,
  syncError,
  syncLabels,
  syncOrder,
  type SyncJob,
} from "../../lib/sync";

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const res = await api("/api/sync", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const jobs: SyncJob[] = res.ok ? ((await res.json()).jobs ?? []) : [];

  return {
    jobs: [...jobs].sort(
      (a, b) => syncOrder.indexOf(a.job) - syncOrder.indexOf(b.job),
    ),
  };
}

export async function action({
  request,
}: Route.ActionArgs): Promise<ActionResult> {
  const token = await requireToken(request);
  const form = await request.formData();
  const job = String(form.get("job") ?? "");
  const intent = String(form.get("intent") ?? "");

  if (!isSyncJob(job) || (intent !== "interval" && intent !== "reset")) {
    return { ok: false, message: "Unknown action" };
  }

  const minutes = intent === "reset" ? null : Number(form.get("minutes"));
  if (minutes !== null && !Number.isInteger(minutes)) {
    return { ok: false, message: "Enter whole minutes." };
  }

  const res = await api(`/api/sync/${job}/interval`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ minutes }),
  });

  if (res.ok) return { ok: true, message: "Saved." };
  if (res.status === unreachableStatus) {
    return { ok: false, message: "Backend not reachable" };
  }

  const data = await res.json().catch(() => ({}));
  if (data.error === "invalid_interval") {
    return {
      ok: false,
      message: `The interval has to be at least ${data.min_minutes ?? 5} minutes.`,
    };
  }
  return { ok: false, message: `Failed (${res.status})` };
}

export default function SyncSettings({ loaderData }: Route.ComponentProps) {
  return (
    <Stack>
      <Block title="Sync intervals">
        {loaderData.jobs.length === 0 ? (
          <p className="text-sm text-ui-fg-muted">No sync jobs available.</p>
        ) : (
          <div className="flex flex-col divide-y divide-ui-border-soft">
            {loaderData.jobs.map((job) => (
              <JobRow key={job.job} job={job} />
            ))}
          </div>
        )}
      </Block>
    </Stack>
  );
}

function JobStatus({ job }: { job: SyncJob }) {
  if (job.running) return <Badge tone="accent">Syncing</Badge>;
  if (job.error) return <Badge tone="bad">{syncError(job.error)}</Badge>;

  return (
    <span className="text-xs text-ui-fg-muted tabular-nums">
      {job.success_at
        ? `Last sync ${formatStamp(job.success_at)} · Next ${formatStamp(job.next_run_at)}`
        : "Never synced"}
    </span>
  );
}

function JobRow({ job }: { job: SyncJob }) {
  const { fetcher, busy, intent, fieldClass, toast } = useSubmission();
  const id = `sync-${job.job}`;

  return (
    <fetcher.Form
      method="post"
      className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0"
    >
      <input type="hidden" name="job" value={job.job} />

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <label htmlFor={id} className="text-sm font-medium text-ui-fg">
          {syncLabels[job.job] ?? job.job}
        </label>
        <JobStatus job={job} />
      </div>

      <div className="flex gap-2">
        <div className="relative w-full">
          <input
            key={job.interval_minutes}
            id={id}
            name="minutes"
            type="number"
            inputMode="numeric"
            min={job.min_minutes}
            step={1}
            required
            defaultValue={job.interval_minutes}
            className={`${fieldClass} pr-12 tabular-nums`}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-xs text-ui-fg-muted">
            min
          </span>
        </div>
        <button
          type="submit"
          name="intent"
          value="interval"
          disabled={busy}
          className={buttonClass}
        >
          {busy && intent === "interval" ? "Saving…" : "Save"}
        </button>
        {job.custom && (
          <button
            type="submit"
            name="intent"
            value="reset"
            formNoValidate
            disabled={busy}
            className={`${buttonClass} whitespace-nowrap`}
          >
            Reset to {job.default_minutes}
          </button>
        )}
      </div>
      {toast}
    </fetcher.Form>
  );
}
