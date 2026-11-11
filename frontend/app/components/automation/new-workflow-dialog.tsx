import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Dialog } from "../dialog";
import { buttonClass, inputClass, primaryButtonClass } from "../setting-row";
import { Notice } from "./notice";
import {
  automationApi,
  chainConnections,
  templates,
} from "../../lib/automation";

type NewWorkflowDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function NewWorkflowDialog({ open, onClose }: NewWorkflowDialogProps) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState(templates[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setTemplate(templates[0].id);
    setError(null);
  }, [open]);

  async function create() {
    const chosen = templates.find((entry) => entry.id === template) ?? templates[0];
    const title = name.trim() || chosen.title;
    const nodes = chosen.build();

    setBusy(true);
    setError(null);

    const created = await automationApi.createWorkflow({
      name: title,
      nodes,
      connections: chainConnections(nodes),
    });
    if (!created.ok) {
      setBusy(false);
      setError(created.message);
      return;
    }

    setBusy(false);
    onClose();
    navigate(`/automation/${created.data.id}`);
  }

  return (
    <Dialog open={open} title="New workflow" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          create();
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ui-fg-muted">Name</span>
          <input
            autoFocus
            className={inputClass}
            value={name}
            placeholder={templates.find((entry) => entry.id === template)?.title}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-xs font-medium text-ui-fg-muted">Start with</legend>
          {templates.map((entry) => (
            <label
              key={entry.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                template === entry.id
                  ? "border-ctp-mauve bg-[color-mix(in_oklab,var(--ctp-mauve)_8%,transparent)]"
                  : "border-ui-border-soft hover:bg-ui-hover"
              }`}
            >
              <input
                type="radio"
                name="template"
                value={entry.id}
                checked={template === entry.id}
                onChange={() => setTemplate(entry.id)}
                className="mt-1 accent-[var(--ctp-mauve)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ui-fg">{entry.title}</span>
                <span className="block text-xs text-ui-fg-muted">{entry.description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {error && <Notice tone="bad">{error}</Notice>}

        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButtonClass} disabled={busy}>
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
