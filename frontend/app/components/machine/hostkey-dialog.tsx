import { Dialog } from "../dialog";
import { Icon } from "../icons";
import { buttonClass, dangerButtonClass, primaryButtonClass } from "../setting-row";
import type { Machine } from "../../lib/machine";
import type { HostKeyInfo } from "../../lib/terminal";

function KeyRow({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-ui-fg-muted">{label}</span>
      <code
        className={`rounded-md border bg-ui-field px-2.5 py-2 font-mono text-xs break-all ${
          tone === "bad"
            ? "border-[color-mix(in_oklab,var(--ui-danger)_45%,transparent)] text-ui-danger"
            : "border-ui-border text-ui-fg"
        }`}
      >
        {value}
      </code>
    </div>
  );
}

export function HostKeyDialog({
  request,
  machine,
  onAnswer,
}: {
  request: { id: number; key: HostKeyInfo } | null;
  machine: Machine;
  onAnswer: (accept: boolean) => void;
}) {
  return (
    <Dialog open={request !== null} title="Unknown host key" onClose={() => onAnswer(false)}>
      {request && (
        <div className="flex flex-col gap-4">
          <span className="truncate font-mono text-sm text-ui-fg">
            {machine.username}@{machine.name} · {machine.ip}:{machine.ssh_port}
          </span>
          <KeyRow label={request.key.keyType || "Key"} value={request.key.fingerprint} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => onAnswer(false)} className={buttonClass}>
              Reject
            </button>
            <button type="button" onClick={() => onAnswer(true)} className={primaryButtonClass}>
              Trust and connect
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

export function HostKeyChangedDialog({
  hostKey,
  machine,
  busy,
  onForget,
  onClose,
}: {
  hostKey: HostKeyInfo | null;
  machine: Machine;
  busy: boolean;
  onForget: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={hostKey !== null} title="Host key changed" onClose={onClose}>
      {hostKey && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-lg border border-[color-mix(in_oklab,var(--ui-danger)_45%,transparent)] bg-[color-mix(in_oklab,var(--ui-danger)_10%,transparent)] p-3">
            <span className="grid size-5 shrink-0 place-items-center text-ui-danger">
              <Icon name="alert" />
            </span>
            <p className="text-sm text-ui-fg">
              {machine.name} presents a different host key than the one saved. The
              connection was stopped.
            </p>
          </div>
          {hostKey.expected && <KeyRow label="Saved" value={hostKey.expected} />}
          <KeyRow label={hostKey.keyType ? `Now · ${hostKey.keyType}` : "Now"} value={hostKey.fingerprint} tone="bad" />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className={buttonClass}>
              Close
            </button>
            <button type="button" disabled={busy} onClick={onForget} className={dangerButtonClass}>
              {busy ? "Removing…" : "Forget saved key"}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
