import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Badge } from "../block";
import { Icon } from "../icons";
import { buttonClass, primaryButtonClass } from "../setting-row";
import { useSubmission } from "../use-submission";
import { machineHref, type Machine, type MachineStatus } from "../../lib/machine";

const slowPollMs = 20_000;
const fastPollMs = 3_000;
const wakeWindowMs = 3 * 60_000;

type Probe = { id: number; online: boolean | null; failed: boolean };

function useMachineStatus(id: number, fast: boolean) {
  const [probe, setProbe] = useState<Probe>({ id, online: null, failed: false });

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const controller = new AbortController();

    async function check() {
      try {
        const res = await fetch(`/machine/status/${id}`, { signal: controller.signal });
        const data = (await res.json().catch(() => null)) as MachineStatus | null;
        if (!stopped) {
          setProbe(
            res.ok && data
              ? { id, online: Boolean(data.online), failed: false }
              : { id, online: null, failed: true },
          );
        }
      } catch {
        if (!stopped && !controller.signal.aborted) {
          setProbe({ id, online: null, failed: true });
        }
      }
      if (!stopped) timer = window.setTimeout(check, fast ? fastPollMs : slowPollMs);
    }

    void check();
    return () => {
      stopped = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [id, fast]);

  return probe.id === id ? probe : { id, online: null, failed: false };
}

export function MachineControls({
  machines,
  machine,
}: {
  machines: Machine[];
  machine: Machine;
}) {
  const navigate = useNavigate();
  const { fetcher, busy, toast } = useSubmission();
  const [wakingSince, setWakingSince] = useState<number | null>(null);
  const waking = wakingSince !== null;
  const status = useMachineStatus(machine.id, waking);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) setWakingSince(Date.now());
  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
    if (wakingSince === null) return;
    if (status.online) {
      setWakingSince(null);
      return;
    }
    const timer = window.setTimeout(
      () => setWakingSince(null),
      Math.max(0, wakingSince + wakeWindowMs - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [wakingSince, status.online]);

  const [tone, label] =
    status.online === true
      ? (["good", "Online"] as const)
      : waking
        ? (["accent", "Waking…"] as const)
        : status.online === false
          ? (["bad", "Offline"] as const)
          : status.failed
            ? (["neutral", "Unknown"] as const)
            : (["neutral", "Checking…"] as const);

  return (
    <>
      {machines.length > 1 && (
        <select
          aria-label="Machine"
          value={machine.id}
          onChange={(event) => navigate(machineHref(Number(event.target.value)))}
          className="h-9 max-w-44 min-w-0 cursor-pointer truncate rounded-md border border-ui-border-strong bg-ui-field px-2 text-sm text-ui-fg outline-none focus:border-[var(--accent)]"
        >
          {machines.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      )}

      <span className="hidden sm:inline-flex" aria-live="polite">
        <Badge tone={tone}>{label}</Badge>
      </span>

      <button
        type="button"
        disabled={busy}
        onClick={() =>
          fetcher.submit(
            { intent: "wake", id: String(machine.id) },
            { method: "post" },
          )
        }
        title={`Wake ${machine.name}`}
        className={`${status.online ? buttonClass : primaryButtonClass} inline-flex items-center gap-1.5`}
      >
        <Icon name="power" className="size-4" />
        {busy ? "Sending…" : "Wake"}
      </button>
      {toast}
    </>
  );
}
