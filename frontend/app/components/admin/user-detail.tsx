import { useState, type FormEvent } from "react";
import { Badge } from "../block";
import { buttonClass, dangerButtonClass } from "../setting-row";
import { useSubmission } from "../use-submission";
import { dataLabels, type AdminDetail } from "../../lib/admin";
import { formatBytes } from "../../lib/format";
import { hashPassword, minPasswordLength } from "../../lib/password";
import { formatStamp, syncError, syncLabels } from "../../lib/sync";

type UserDetailProps = {
  name: string;
  detail: AdminDetail;
  isSelf: boolean;
};

const connectionLabels: [keyof AdminDetail["connections"], string][] = [
  ["name", "DHBW name"],
  ["dualis", "Dualis"],
  ["mail", "Mail"],
  ["moodle", "Moodle"],
  ["timetable", "Timetable"],
];

export function UserDetail({ name, detail, isSelf }: UserDetailProps) {
  const guard = detail.dualis_guard;
  const sessions = detail.sessions ?? [];
  const data = Object.entries(detail.data ?? {}).filter(([, count]) => count > 0);

  return (
    <div className="mt-3 flex flex-col gap-4 rounded-lg border border-ui-border-soft bg-ui-surface p-4">
      <div className="flex flex-wrap gap-1.5">
        {connectionLabels.map(([key, label]) => (
          <Badge key={key} tone={detail.connections[key] ? "good" : "neutral"}>
            {label}
          </Badge>
        ))}
      </div>

      {(detail.sync ?? []).length > 0 && (
        <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
          {(detail.sync ?? []).map((job) => (
            <div key={job.job} className="contents">
              <dt className="text-ui-fg-muted">{syncLabels[job.job] ?? job.job}</dt>
              <dd className={job.error ? "text-ui-danger" : "text-ui-fg"}>
                {job.running
                  ? "Running…"
                  : job.error
                    ? syncError(job.error)
                    : job.success_at
                      ? formatStamp(job.success_at)
                      : "/"}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {(data.length > 0 || detail.storage_bytes > 0) && (
        <p className="text-xs text-ui-fg-muted tabular-nums">
          {[...data.map(([key, count]) => `${count} ${dataLabels[key] ?? key}`), `${formatBytes(detail.storage_bytes)} files`].join(" · ")}
        </p>
      )}

      {!isSelf && (
        <div className="flex flex-col gap-3 border-t border-ui-border-soft pt-4">
          <PasswordForm name={name} />
          <div className="flex flex-wrap gap-2">
            <ActionButton name={name} intent="logout-all" label={`End ${sessions.length} session${sessions.length === 1 ? "" : "s"}`} disabled={sessions.length === 0} />
            {guard && (guard.locked || guard.failures > 0) && (
              <ActionButton
                name={name}
                intent="reset-dualis"
                label={guard.locked ? "Reset Dualis lock" : `Reset Dualis (${guard.failures}/${guard.max_failures})`}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({ name, intent, label, disabled }: { name: string; intent: string; label: string; disabled?: boolean }) {
  const { fetcher, busy, toast } = useSubmission();

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="name" value={name} />
      <button type="submit" name="intent" value={intent} disabled={busy || disabled} className={dangerButtonClass}>
        {busy ? "…" : label}
      </button>
      {toast}
    </fetcher.Form>
  );
}

function PasswordForm({ name }: { name: string }) {
  const { fetcher, busy, fieldClass, toast } = useSubmission();
  const [hashing, setHashing] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = String(new FormData(form).get("password") ?? "");
    setHashing(true);
    const passwordHash = await hashPassword(name, password);
    setHashing(false);
    fetcher.submit({ intent: "set-password", name, passwordHash }, { method: "post" });
    form.reset();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <label htmlFor={`password-${name}`} className="text-xs text-ui-fg-muted">
        New password
      </label>
      <div className="flex gap-2">
        <input
          id={`password-${name}`}
          name="password"
          type="password"
          required
          minLength={minPasswordLength}
          autoComplete="new-password"
          className={fieldClass}
        />
        <button type="submit" disabled={busy || hashing} className={buttonClass}>
          {busy || hashing ? "Saving…" : "Set"}
        </button>
      </div>
      {toast}
    </form>
  );
}

export function CreateUserForm() {
  const { fetcher, busy, fieldClass, toast } = useSubmission();
  const [hashing, setHashing] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const name = String(values.get("name") ?? "").trim();
    const password = String(values.get("password") ?? "");
    setHashing(true);
    const passwordHash = await hashPassword(name, password);
    setHashing(false);
    fetcher.submit(
      { intent: "create", name, passwordHash, is_admin: values.get("is_admin") === "on" ? "true" : "false" },
      { method: "post" },
    );
    form.reset();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ui-fg-muted">Name</span>
          <input name="name" required autoComplete="off" spellCheck={false} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ui-fg-muted">Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={minPasswordLength}
            autoComplete="new-password"
            className={fieldClass}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ui-fg">
          <input type="checkbox" name="is_admin" className="size-4 accent-[var(--ctp-mauve)]" />
          Admin
        </label>
        <button type="submit" disabled={busy || hashing} className={`${buttonClass} ml-auto`}>
          {busy || hashing ? "Adding…" : "Add user"}
        </button>
      </div>
      {toast}
    </form>
  );
}

