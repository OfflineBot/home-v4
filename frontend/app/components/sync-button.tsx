import { useEffect, useState } from "react";
import { useRevalidator } from "react-router";
import { Icon } from "./icons";
import { buttonClass } from "./setting-row";
import { Toast } from "./toast";
import { formatStamp, syncError, type SyncJob } from "../lib/sync";

const pollMs = 2000;

const startErrors: Record<string, string> = {
  not_configured: "Set up the connection under Settings → Connections first.",
  running: "A sync is already running.",
  too_many_attempts: "Too many syncs. Wait a minute and try again.",
};

type SyncButtonProps = {
  job: string;
  state: SyncJob | null;
};

export function SyncButton({ job, state }: SyncButtonProps) {
  const revalidator = useRevalidator();
  const [running, setRunning] = useState(state?.running ?? false);
  const [failure, setFailure] = useState({ message: "", attempt: 0 });

  function fail(message: string) {
    setFailure((current) => ({ message, attempt: current.attempt + 1 }));
  }

  useEffect(() => {
    if (!running) return;

    let active = true;
    const id = setInterval(async () => {
      const res = await fetch(`/sync/${job}`).catch(() => null);
      const data = res?.ok ? await res.json() : null;
      const current: SyncJob | null = data?.job ?? null;
      if (!active || !current || current.running) return;

      setRunning(false);
      if (current.error) fail(`Sync failed: ${syncError(current.error)}`);
      revalidator.revalidate();
    }, pollMs);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, [running, job]);

  async function start() {
    setRunning(true);
    const res = await fetch(`/sync/${job}`, { method: "POST" }).catch(() => null);
    if (res?.ok) return;

    setRunning(false);
    const data = res ? await res.json().catch(() => ({})) : {};
    fail(startErrors[data.error] ?? "The sync could not be started.");
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={running}
        title={
          state?.success_at ? `Last sync ${formatStamp(state.success_at)}` : undefined
        }
        className={`${buttonClass} inline-flex items-center gap-2`}
      >
        <Icon
          name="sync"
          className={`size-4 ${running ? "animate-spin motion-reduce:animate-none" : ""}`}
        />
        {running ? "Syncing…" : "Sync"}
      </button>
      <Toast
        key={failure.attempt}
        message={failure.attempt > 0 ? failure.message : null}
      />
    </>
  );
}
