import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, ExpandableBlock } from "../block";
import { Icon } from "../icons";
import { buttonClass, dangerButtonClass } from "../setting-row";
import { formatStamp } from "../../lib/sync";
import { useSubmission } from "../use-submission";
import {
  coursePattern,
  dhbwLocations,
  dhbwModules,
  splitCourse,
  type DHBWAccount,
  type DHBWModule,
  type DualisGuard,
} from "../../lib/dhbw";
import { navColor } from "../../lib/nav";

const rowClass = "flex flex-col gap-2 py-4 first:pt-0 last:pb-0";
const fieldRowClass = "flex flex-col gap-2";
const labelClass = "text-sm font-medium text-ui-fg";

type DHBWConnectionProps = {
  account: DHBWAccount | null;
  timetable: string | null;
};

export function DHBWConnection({ account, timetable }: DHBWConnectionProps) {
  return (
    <ExpandableBlock
      title="DHBW"
      icon="grades"
      color={navColor("grades")}
      summary={null}
    >
      <div className="flex flex-col divide-y divide-ui-border-soft">
        <Section title="Account">
          <NameRow name={account?.name ?? null} />

          <div className="ml-1 flex flex-col divide-y divide-ui-border-soft border-l-2 border-ui-border-soft pl-4">
            {dhbwModules.map((module) => (
              <ModuleRow
                key={module.name}
                name={module.name}
                label={module.label}
                connected={account?.[module.name] ?? false}
                login={account?.logins?.[module.name]}
              />
            ))}
          </div>

          {account?.dualis_guard && <GuardRow guard={account.dualis_guard} />}
          {dhbwModules.some((module) => account?.[module.name]) && <RemoveAllRow />}
        </Section>

        <Section title="Timetable">
          <TimetableRow url={timetable} />
        </Section>
      </div>
    </ExpandableBlock>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <h3 className="text-xs font-medium tracking-wide text-ui-fg-faint uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ConfirmButton({ intent, label, busyLabel, busy, active }: {
  intent: string;
  label: string;
  busyLabel: string;
  busy: boolean;
  active: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!busy) setConfirming(false);
  }, [busy]);

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} disabled={busy} className={dangerButtonClass}>
        {label}
      </button>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={buttonClass}>
        Cancel
      </button>
      <button type="submit" name="intent" value={intent} formNoValidate disabled={busy} className={dangerButtonClass}>
        {busy && active ? busyLabel : `Confirm ${label.toLowerCase()}`}
      </button>
    </>
  );
}

function RemoveAllRow() {
  const { fetcher, busy, intent, toast } = useSubmission();

  return (
    <fetcher.Form method="post" className="flex flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 text-sm text-ui-fg-muted">Remove every saved DHBW password at once.</span>
      <ConfirmButton
        intent="dhbw-passwords-remove"
        label="Remove all"
        busyLabel="Removing…"
        busy={busy}
        active={intent === "dhbw-passwords-remove"}
      />
      {toast}
    </fetcher.Form>
  );
}

function GuardRow({ guard }: { guard: DualisGuard }) {
  const { fetcher, busy, intent, toast } = useSubmission();
  if (!guard.locked && guard.failures === 0) return null;

  return (
    <fetcher.Form method="post" className="flex flex-wrap items-center gap-2">
      {guard.locked ? (
        <Badge tone="bad">Locked</Badge>
      ) : (
        <Badge>{`${guard.failures} of ${guard.max_failures} failed logins`}</Badge>
      )}
      {guard.next_attempt_at && !guard.locked && (
        <span className="text-xs text-ui-fg-muted">Next try {formatStamp(guard.next_attempt_at)}</span>
      )}
      <span className="flex-1" />
      <ConfirmButton
        intent="dualis-reset"
        label="Reset lock"
        busyLabel="Resetting…"
        busy={busy}
        active={intent === "dualis-reset"}
      />
      {toast}
    </fetcher.Form>
  );
}

function NameRow({ name }: { name: string | null }) {
  const { fetcher, busy, intent, fieldClass, toast } = useSubmission();

  return (
    <fetcher.Form method="post" className={fieldRowClass}>
      <label htmlFor="dhbw-name" className={labelClass}>
        Username
      </label>
      <div className="flex gap-2">
        <input
          key={name ?? ""}
          id="dhbw-name"
          name="name"
          required
          defaultValue={name ?? ""}
          autoComplete="off"
          spellCheck={false}
          className={fieldClass}
        />
        <button
          type="submit"
          name="intent"
          value="dhbw-name"
          disabled={busy}
          className={buttonClass}
        >
          {busy && intent === "dhbw-name" ? "Saving…" : "Save"}
        </button>
        {name && (
          <ConfirmButton
            intent="dhbw-name-remove"
            label="Remove"
            busyLabel="Removing…"
            busy={busy}
            active={intent === "dhbw-name-remove"}
          />
        )}
      </div>
      {toast}
    </fetcher.Form>
  );
}

type ModuleRowProps = {
  name: DHBWModule;
  label: string;
  connected: boolean;
  login?: string;
};

function ModuleRow({ name, label, connected, login }: ModuleRowProps) {
  const { fetcher, busy, intent, fieldClass, toast } = useSubmission();
  const form = useRef<HTMLFormElement>(null);
  const [changing, setChanging] = useState(false);
  const id = `dhbw-${name}`;
  const showInput = !connected || changing;

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data?.ok) return;
    form.current?.reset();
    setChanging(false);
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form ref={form} method="post" className={rowClass}>
      <input type="hidden" name="module" value={name} />

      <div className="flex min-w-0 items-center gap-2">
        <label htmlFor={id} className={`${labelClass} shrink-0`}>
          {label} password
        </label>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-ui-fg-muted">
          {login}
        </span>
        {connected && (
          <Badge tone="good">
            <Icon name="check" className="mr-1 size-3" />
            Connected
          </Badge>
        )}
        {connected && !changing && (
          <>
            <button
              type="button"
              onClick={() => setChanging(true)}
              disabled={busy}
              className={buttonClass}
            >
              Change
            </button>
            <button
              type="submit"
              name="intent"
              value="dhbw-remove"
              formNoValidate
              disabled={busy}
              className={dangerButtonClass}
            >
              {busy && intent === "dhbw-remove" ? "Removing…" : "Remove"}
            </button>
          </>
        )}
      </div>

      {showInput && (
        <div className="flex gap-2">
          <input
            id={id}
            type="password"
            name="password"
            required
            autoFocus={changing}
            autoComplete="new-password"
            className={fieldClass}
          />
          <button
            type="submit"
            name="intent"
            value="dhbw-password"
            disabled={busy}
            className={buttonClass}
          >
            {busy && intent === "dhbw-password" ? "Checking…" : "Save"}
          </button>
          {changing && (
            <button
              type="button"
              onClick={() => setChanging(false)}
              disabled={busy}
              className={buttonClass}
            >
              Cancel
            </button>
          )}
        </div>
      )}
      {toast}
    </fetcher.Form>
  );
}

function TimetableRow({ url }: { url: string | null }) {
  const { fetcher, busy, intent, fieldClass, toast } = useSubmission();
  const current = splitCourse(url);

  return (
    <fetcher.Form method="post" className={fieldRowClass}>
      <label htmlFor="dhbw-course" className={labelClass}>
        Course
      </label>
      <div key={url ?? ""} className="flex gap-2">
        <select
          name="location"
          aria-label="Location"
          defaultValue={current.location}
          className="h-9 shrink-0 cursor-pointer rounded-md border border-ui-border-strong bg-ui-field px-2 text-sm text-ui-fg outline-none focus:border-ctp-mauve"
        >
          {dhbwLocations.map((location) => (
            <option key={location.code} value={location.code}>
              {location.label}
            </option>
          ))}
        </select>
        <input
          id="dhbw-course"
          name="course"
          required
          pattern={coursePattern}
          placeholder="WDS125"
          defaultValue={current.course}
          onInput={(event) => {
            event.currentTarget.value = event.currentTarget.value.toUpperCase();
          }}
          autoComplete="off"
          spellCheck={false}
          className={`${fieldClass} font-mono uppercase`}
        />
        <button
          type="submit"
          name="intent"
          value="timetable-set"
          disabled={busy}
          className={buttonClass}
        >
          {busy && intent === "timetable-set" ? "Checking…" : "Save"}
        </button>
        {url && (
          <button
            type="submit"
            name="intent"
            value="timetable-remove"
            formNoValidate
            disabled={busy}
            className={dangerButtonClass}
          >
            {busy && intent === "timetable-remove" ? "Removing…" : "Remove"}
          </button>
        )}
      </div>
      {toast}
    </fetcher.Form>
  );
}
