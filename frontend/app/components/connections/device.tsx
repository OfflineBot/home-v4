import { useEffect, useRef, useState, type ReactNode } from "react";
import { Form } from "react-router";
import { Icon } from "../icons";
import { Badge } from "../block";
import {
  dangerButtonClass,
  fieldGridClass,
  primaryButtonClass,
} from "../setting-row";
import { useSubmission } from "../use-submission";

export type DeviceEntry = {
  id: number;
  title: string;
  detail: string;
};

const armMs = 3000;

export function ConnectedCount({ count }: { count: number }) {
  return (
    <Badge tone={count > 0 ? "good" : "neutral"}>{count} connected</Badge>
  );
}

type DeviceListProps = {
  icon: string;
  removeIntent: string;
  devices: DeviceEntry[];
  wired?: boolean;
};

export function DeviceList({
  icon,
  removeIntent,
  devices,
  wired = false,
}: DeviceListProps) {
  if (devices.length === 0) return null;

  return (
    <ul className="flex flex-col divide-y divide-ui-border-soft">
      {devices.map((device) => (
        <li
          key={device.id}
          className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full border border-ui-border text-[var(--accent)]">
            <Icon name={icon} className="size-5" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ui-fg">
              {device.title}
            </span>
            <span className="block truncate font-mono text-xs text-ui-fg-muted">
              {device.detail}
            </span>
          </span>

          {wired ? (
            <RemoveDevice id={device.id} intent={removeIntent} />
          ) : (
            <Form method="post">
              <input type="hidden" name="id" value={device.id} />
              <button
                //TODO: NOT WIRED!
                type="submit"
                name="intent"
                value={removeIntent}
                disabled
                className={dangerButtonClass}
              >
                Remove
              </button>
            </Form>
          )}
        </li>
      ))}
    </ul>
  );
}

function RemoveDevice({ id, intent }: { id: number; intent: string }) {
  const { fetcher, busy, toast } = useSubmission();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), armMs);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <fetcher.Form
      method="post"
      onSubmit={(event) => {
        if (armed) return;
        event.preventDefault();
        setArmed(true);
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="intent" value={intent} />
      <button type="submit" disabled={busy} className={dangerButtonClass}>
        {busy ? "Removing…" : armed ? "Confirm" : "Remove"}
      </button>
      {toast}
    </fetcher.Form>
  );
}

type AddDeviceFormProps = {
  label: string;
  intent: string;
  wired?: boolean;
  children: ReactNode;
};

const formClass =
  "mt-4 border-t border-ui-border-soft pt-4 first:mt-0 first:border-t-0 first:pt-0";

export function AddDeviceForm({
  label,
  intent,
  wired = false,
  children,
}: AddDeviceFormProps) {
  if (wired) {
    return (
      <WiredAddForm label={label} intent={intent}>
        {children}
      </WiredAddForm>
    );
  }

  return (
    <Form method="post" className={formClass}>
      <p className="text-sm font-medium text-ui-fg">{label}</p>
      <div className={`${fieldGridClass} mt-3`}>{children}</div>
      <button
        //TODO: NOT WIRED!
        type="submit"
        name="intent"
        value={intent}
        disabled
        className={`${primaryButtonClass} mt-3`}
      >
        {label}
      </button>
    </Form>
  );
}

function WiredAddForm({
  label,
  intent,
  children,
}: Omit<AddDeviceFormProps, "wired">) {
  const { fetcher, busy, failed, toast } = useSubmission();
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) form.current?.reset();
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form
      ref={form}
      method="post"
      className={`${formClass} [&_input]:transition-colors [&_input]:duration-300 motion-reduce:[&_input]:transition-none ${
        failed ? "[&_input]:border-ui-danger!" : ""
      }`}
    >
      <p className="text-sm font-medium text-ui-fg">{label}</p>
      <div className={`${fieldGridClass} mt-3`}>{children}</div>
      <button
        type="submit"
        name="intent"
        value={intent}
        disabled={busy}
        className={`${primaryButtonClass} mt-3`}
      >
        {busy ? "Saving…" : label}
      </button>
      {toast}
    </fetcher.Form>
  );
}
