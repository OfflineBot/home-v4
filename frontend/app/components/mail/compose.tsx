import { useState } from "react";
import { Icon } from "../icons";
import {
  Field,
  buttonClass,
  inputClass,
  primaryButtonClass,
} from "../setting-row";
import { RecipientInput } from "./recipient-input";
import type { ComposeDraft, ComposeMode } from "../../lib/mail";

const titles: Record<ComposeMode, string> = {
  new: "New mail",
  reply: "Reply",
  "reply-all": "Reply all",
  forward: "Forward",
};

type ComposePaneProps = {
  draft: ComposeDraft;
  onClose: () => void;
  className?: string;
};

export function ComposePane({
  draft,
  onClose,
  className = "",
}: ComposePaneProps) {
  const [showCc, setShowCc] = useState(draft.cc !== "");
  const replying = draft.mode === "reply" || draft.mode === "reply-all";

  return (
    <section
      className={`min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-ui-border bg-ui-raised ${className}`}
    >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-ui-border-soft bg-ui-surface px-4">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-ui-fg">
          {titles[draft.mode]}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Discard"
          title="Discard"
          className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-ui-fg-muted outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
        >
          <Icon name="close" className="size-4" />
        </button>
      </header>

      <form
        onSubmit={(event) => event.preventDefault()}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
      >
        <Field label="To">
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <RecipientInput
                name="to"
                label="To"
                defaultValue={draft.to}
                required
                autoFocus={!replying}
              />
            </div>
            {!showCc && (
              <button
                type="button"
                onClick={() => setShowCc(true)}
                className={buttonClass}
              >
                Cc
              </button>
            )}
          </div>
        </Field>

        {showCc && (
          <Field label="Cc">
            <RecipientInput
              name="cc"
              label="Cc"
              defaultValue={draft.cc}
            />
          </Field>
        )}

        <Field label="Subject">
          <input
            name="subject"
            defaultValue={draft.subject}
            autoComplete="off"
            className={inputClass}
          />
        </Field>

        <label className="flex min-h-48 flex-1 flex-col gap-1">
          <span className="text-xs text-ui-fg-muted">Message</span>
          <textarea
            name="body"
            defaultValue={draft.body}
            autoFocus={replying}
            className="min-h-0 w-full flex-1 resize-none rounded-md border border-ui-border-strong bg-ui-field px-3 py-2 text-sm text-ui-fg outline-none focus:border-ctp-mauve"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            //TODO: NOT WIRED!
            type="submit"
            disabled
            className={primaryButtonClass}
          >
            Send
          </button>
          <button type="button" onClick={onClose} className={buttonClass}>
            Discard
          </button>
          <input
            //TODO: NOT WIRED!
            type="file"
            name="attachments"
            multiple
            disabled
            aria-label="Attachments"
            className="ml-auto text-sm text-ui-fg-muted file:mr-3 file:h-8 file:cursor-pointer file:rounded-md file:border file:border-ui-border file:bg-ui-field file:px-3 file:text-sm file:text-ui-fg disabled:opacity-50"
          />
        </div>
      </form>
    </section>
  );
}
