import { useState } from "react";
import { useRevalidator } from "react-router";
import { Badge, Placeholder } from "../block";
import { Icon } from "../icons";
import { primaryButtonClass } from "../setting-row";
import { ConnectionDialog } from "./connection-dialog";
import { NodeIcon } from "./node-icon";
import { smallButtonClass, smallDangerClass } from "./notice";
import { useFlash } from "./use-flash";
import {
  automationApi,
  type Connection,
  type CredentialTest,
  type IconInfo,
} from "../../lib/automation";
import { formatStamp } from "../../lib/sync";

type ConnectionListProps = {
  connections: Connection[];
  types: Record<string, IconInfo>;
  disabled: boolean;
};

export function ConnectionList({ connections, types, disabled }: ConnectionListProps) {
  const revalidator = useRevalidator();
  const [dialog, setDialog] = useState<{ open: boolean; editing: Connection | null }>({
    open: false,
    editing: null,
  });

  return (
    <div className="flex flex-col gap-4">
      {connections.length === 0 ? (
        <Placeholder
          icon={<Icon name="connections" />}
          hint="No connections yet. Add one for every service your workflows talk to, e.g. a Discord webhook or a Telegram bot."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-ui-border-soft">
          {connections.map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              type={types[connection.type]}
              disabled={disabled}
              onEdit={() => setDialog({ open: true, editing: connection })}
            />
          ))}
        </ul>
      )}

      <div>
        <button
          type="button"
          className={`${primaryButtonClass} inline-flex items-center gap-2`}
          disabled={disabled}
          onClick={() => setDialog({ open: true, editing: null })}
        >
          <Icon name="plus" className="size-4" />
          Add connection
        </button>
      </div>

      <ConnectionDialog
        open={dialog.open}
        editing={dialog.editing}
        onClose={() => setDialog({ open: false, editing: null })}
        onSaved={() => revalidator.revalidate()}
      />
    </div>
  );
}

type RowProps = {
  connection: Connection;
  type: IconInfo | undefined;
  disabled: boolean;
  onEdit: () => void;
};

function ConnectionRow({ connection, type, disabled, onEdit }: RowProps) {
  const revalidator = useRevalidator();
  const { fail, toast } = useFlash();
  const [busy, setBusy] = useState<"test" | "delete" | null>(null);
  const [test, setTest] = useState<CredentialTest | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function runTest() {
    setBusy("test");
    const result = await automationApi.testConnection(connection.id);
    setBusy(null);
    if (result.ok) setTest(result.data);
    else fail(result.message);
  }

  async function remove() {
    setBusy("delete");
    const result = await automationApi.deleteConnection(connection.id);
    setBusy(null);
    setConfirming(false);

    if (result.ok) {
      revalidator.revalidate();
      return;
    }
    if (result.error.error === "credential_in_use") {
      const count = result.error.workflows?.length ?? 0;
      fail(`Still used by ${count} workflow${count === 1 ? "" : "s"}. Remove it there first.`);
      return;
    }
    fail(result.message);
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
      <NodeIcon info={type ?? { label: connection.type, url: null, icon: null, color: null }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-ui-fg">{connection.name}</span>
          {test && (
            <span title={test.message}>
              <Badge tone={test.ok ? "good" : "bad"}>{test.ok ? "Works" : "Test failed"}</Badge>
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-ui-fg-muted">
          {type?.label ?? connection.type} · added {formatStamp(connection.created_at)}
        </p>
        {test && !test.ok && test.message && (
          <p className="mt-1 line-clamp-2 text-xs text-ui-danger">{test.message}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={smallButtonClass} disabled={disabled || busy !== null} onClick={runTest}>
          {busy === "test" ? "Testing…" : "Test"}
        </button>
        <button type="button" className={smallButtonClass} disabled={disabled || busy !== null} onClick={onEdit}>
          Edit
        </button>
        {confirming ? (
          <button type="button" className={smallDangerClass} disabled={busy !== null} onClick={remove}>
            {busy === "delete" ? "Removing…" : "Confirm remove"}
          </button>
        ) : (
          <button
            type="button"
            className={smallDangerClass}
            disabled={disabled || busy !== null}
            onClick={() => setConfirming(true)}
          >
            Remove
          </button>
        )}
      </div>
      {toast}
    </li>
  );
}
