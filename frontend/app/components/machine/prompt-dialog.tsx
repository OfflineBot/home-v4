import { useEffect, useRef, useState } from "react";
import { Dialog } from "../dialog";
import { Field, buttonClass, inputClass, primaryButtonClass } from "../setting-row";
import type { Machine } from "../../lib/machine";
import type { LoginPrompt } from "../../lib/terminal";

const flashMs = 1600;

type PromptDialogProps = {
  request: { id: number; prompt: LoginPrompt; session: string } | null;
  machine: Machine;
  onSubmit: (answers: string[]) => void;
  onCancel: () => void;
};

function promptLabel(text: string, index: number, kind: LoginPrompt["kind"]) {
  const label = text.trim().replace(/:$/, "");
  if (label) return label;
  return kind === "password" && index === 0 ? "Password" : `Answer ${index + 1}`;
}

export function PromptDialog({ request, machine, onSubmit, onCancel }: PromptDialogProps) {
  const form = useRef<HTMLFormElement>(null);
  const [flash, setFlash] = useState(false);
  const prompt = request?.prompt ?? null;
  const retry = (prompt?.attempt ?? 1) > 1;

  useEffect(() => {
    if (!request) return;
    const frame = requestAnimationFrame(() => {
      form.current?.reset();
      form.current?.querySelector<HTMLInputElement>("input:not([hidden])")?.focus();
    });
    if (!retry) return () => cancelAnimationFrame(frame);

    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), flashMs);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [request, retry]);

  const title = !prompt
    ? "SSH login"
    : prompt.kind === "password"
      ? "SSH password"
      : prompt.name || "SSH login";

  return (
    <Dialog open={request !== null} title={title} onClose={onCancel}>
      {prompt && request && (
        <form
          key={request.id}
          ref={form}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            onSubmit(prompt.prompts.map((_, index) => String(data.get(`answer-${index}`) ?? "")));
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-mono text-sm text-ui-fg">
              {machine.username}@{machine.name}
            </span>
            <span className="truncate font-mono text-xs text-ui-fg-muted">
              {machine.ip}:{machine.ssh_port} · {request.session}
            </span>
          </div>

          {prompt.instruction && (
            <p className="text-sm whitespace-pre-line text-ui-fg-muted">{prompt.instruction}</p>
          )}

          <input
            type="text"
            name="username"
            autoComplete="username"
            value={`${machine.username}@${machine.ip}`}
            readOnly
            hidden
          />
          {prompt.prompts.map((entry, index) => (
            <Field key={index} label={promptLabel(entry.text, index, prompt.kind)}>
              <input
                name={`answer-${index}`}
                type={entry.echo ? "text" : "password"}
                autoComplete={entry.echo ? "off" : "current-password"}
                spellCheck={false}
                className={`${inputClass} transition-colors duration-300 motion-reduce:transition-none ${
                  flash ? "border-ui-danger!" : ""
                }`}
              />
            </Field>
          ))}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className={buttonClass}>
              Cancel
            </button>
            <button type="submit" className={primaryButtonClass}>
              Connect
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
