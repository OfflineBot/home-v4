import { useEffect, useState } from "react";
import { Dialog } from "../dialog";
import { Badge } from "../block";
import { buttonClass, primaryButtonClass } from "../setting-row";
import { codeAreaClass, Notice } from "./notice";
import { automationApi, pretty, type RunResult } from "../../lib/automation";

type RunDialogProps = {
  open: boolean;
  workflowId: string;
  onClose: () => void;
  onRan: () => void;
};

const samplePayload = pretty({ hello: "world" });

export function RunDialog({ open, workflowId, onClose, onRan }: RunDialogProps) {
  const [payload, setPayload] = useState(samplePayload);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setResult(null);
  }, [open]);

  async function run() {
    let body: unknown = {};
    if (payload.trim()) {
      try {
        body = JSON.parse(payload);
      } catch {
        setError("The data is not valid JSON.");
        return;
      }
    }

    setBusy(true);
    setError(null);
    const response = await automationApi.run(workflowId, body);
    setBusy(false);

    if (!response.ok) {
      setError(response.message);
      return;
    }
    setResult(response.data);
    onRan();
  }

  const good = result ? result.status >= 200 && result.status < 300 : false;

  return (
    <Dialog open={open} title="Run workflow" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ui-fg-muted">Data to send (JSON)</span>
          <textarea
            className={codeAreaClass}
            spellCheck={false}
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
          />
          <span className="text-xs text-ui-fg-faint">Steps can read it as {"{{ $json.body }}"}.</span>
        </label>

        {error && <Notice tone="bad">{error}</Notice>}

        {result && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-ui-fg-muted">Answer</span>
              <Badge tone={good ? "good" : "bad"}>HTTP {result.status}</Badge>
              {result.truncated && <Badge>Shortened</Badge>}
            </div>
            {!good && (
              <Notice tone="warn">A step failed. Open the Runs tab to see which one and why.</Notice>
            )}
            <pre className="max-h-72 overflow-auto rounded-md bg-ui-field p-3 font-mono text-xs leading-relaxed text-ui-fg">
              {result.json !== null && result.json !== undefined
                ? pretty(result.json)
                : result.text || "(empty)"}
            </pre>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass} onClick={onClose}>
            Close
          </button>
          <button type="button" className={primaryButtonClass} disabled={busy} onClick={run}>
            {busy ? "Running…" : result ? "Run again" : "Run"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
