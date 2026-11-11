import { useEffect, useState } from "react";
import { Dialog } from "../dialog";
import {
  Field,
  buttonClass,
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
} from "../setting-row";
import type { CalendarCategory, CategoryDraft } from "../../lib/calendar-events";
import { accentColors, accentVars } from "../../lib/nav";

type CategoryDialogProps = {
  open: boolean;
  adding: boolean;
  categories: CalendarCategory[];
  onClose: () => void;
  onSave: (draft: CategoryDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

function freshDraft(categories: CalendarCategory[]): CategoryDraft {
  const used = new Set(categories.map((category) => category.color));
  return {
    name: "",
    color: accentColors.find((color) => !used.has(color)) ?? accentColors[0],
    hidden: false,
  };
}

export function CategoryDialog({
  open,
  adding,
  categories,
  onClose,
  onSave,
  onDelete,
}: CategoryDialogProps) {
  const [editing, setEditing] = useState<CategoryDraft | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    if (open && adding) setEditing(freshDraft(categories));
  }, [open, adding]);

  function close() {
    setEditing(null);
    setConfirming(null);
    onClose();
  }

  function add() {
    setConfirming(null);
    setEditing(freshDraft(categories));
  }

  return (
    <Dialog open={open} title="Categories" onClose={close}>
      {categories.length > 0 && (
        <ul className="-mt-1 mb-3 flex flex-col divide-y divide-ui-border-soft">
          {categories.map((category) => (
            <li
              key={category.id}
              style={accentVars(category.color)}
              className="flex items-center gap-3 py-2"
            >
              <span className="size-2.5 shrink-0 rounded-full bg-[var(--accent)]" />
              <span className="min-w-0 flex-1 truncate text-sm text-ui-fg">
                {category.name}
                {category.source && (
                  <span className="ml-2 text-xs text-ui-fg-muted">
                    DHBW timetable
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  setConfirming(null);
                  setEditing(category);
                }}
                className={`${buttonClass} h-8`}
              >
                Edit
              </button>
              {!category.source && (
                <button
                  type="button"
                  onClick={async () => {
                    if (confirming !== category.id) {
                      setConfirming(category.id);
                      return;
                    }
                    await onDelete(category.id);
                    setConfirming(null);
                    if (editing?.id === category.id) setEditing(null);
                  }}
                  className={`${dangerButtonClass} h-8`}
                >
                  {confirming === category.id ? "Delete with events" : "Delete"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <CategoryForm
          key={editing.id ?? "new"}
          draft={editing}
          onCancel={() => setEditing(null)}
          onSave={async (draft) => {
            await onSave(draft);
            setEditing(null);
          }}
        />
      ) : (
        <button type="button" onClick={add} className={buttonClass}>
          Add category
        </button>
      )}
    </Dialog>
  );
}

type CategoryFormProps = {
  draft: CategoryDraft;
  onSave: (draft: CategoryDraft) => Promise<void>;
  onCancel: () => void;
};

function CategoryForm({ draft, onSave, onCancel }: CategoryFormProps) {
  const [name, setName] = useState(draft.name);
  const [color, setColor] = useState(draft.color);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSave({ ...draft, name: name.trim(), color });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-lg border border-ui-border-soft bg-ui-surface p-3"
    >
      <Field label="Name">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoFocus
          autoComplete="off"
          className={inputClass}
        />
      </Field>

      <fieldset>
        <legend className="mb-1 text-xs text-ui-fg-muted">Color</legend>
        <div className="flex flex-wrap gap-1">
          {accentColors.map((option) => (
            <label
              key={option}
              title={option}
              style={accentVars(option)}
              className={`grid size-7 cursor-pointer place-items-center rounded-full border-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ui-ring motion-reduce:transition-none ${
                color === option ? "border-[var(--accent)]" : "border-transparent"
              }`}
            >
              <input
                type="radio"
                name="color"
                value={option}
                checked={color === option}
                onChange={() => setColor(option)}
                className="sr-only"
              />
              <span className="size-4 rounded-full bg-[var(--accent)]" />
              <span className="sr-only">{option}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || name.trim() === ""}
          className={primaryButtonClass}
        >
          {draft.id ? "Save" : "Add"}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}
