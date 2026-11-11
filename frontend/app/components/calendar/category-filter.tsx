import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons";
import { controlClass } from "./toolbar";
import type { CalendarCategory } from "../../lib/calendar-events";
import { accentVars } from "../../lib/nav";

const rowClass =
  "flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2 text-left text-sm outline-none transition-colors hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none";

type CategoryFilterProps = {
  categories: CalendarCategory[];
  hidden: string[];
  showHidden: boolean;
  onToggle: (id: string) => void;
  onShowHidden: (show: boolean) => void;
  onManage: () => void;
};

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`grid size-4 shrink-0 place-items-center rounded border transition-colors motion-reduce:transition-none ${
        checked
          ? "border-[var(--accent)] bg-[var(--accent)] text-ui-frame"
          : "border-ui-border-strong text-transparent"
      }`}
    >
      <Icon name="check" className="size-3" />
    </span>
  );
}

export function CategoryFilter({
  categories,
  hidden,
  showHidden,
  onToggle,
  onShowHidden,
  onManage,
}: CategoryFilterProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const shown = categories.filter((category) => !hidden.includes(category.id));
  const filtered = shown.length < categories.length;

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`${controlClass} inline-flex cursor-pointer gap-1.5 px-3 ${
          filtered ? "border-[color-mix(in_oklab,var(--accent)_45%,transparent)]" : ""
        }`}
      >
        <Icon
          name="filter"
          className={`size-4 ${filtered ? "text-[var(--accent)]" : "text-ui-fg-muted"}`}
        />
        Filter
        {filtered && (
          <span className="rounded-full bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] px-1.5 text-xs leading-5 text-[var(--accent-fg)] tabular-nums">
            {shown.length}/{categories.length}
          </span>
        )}
      </button>

      <div
        inert={!open}
        className={`absolute top-full right-0 z-30 mt-2 w-64 origin-top-right rounded-lg border border-ui-border bg-ui-raised p-1 transition-[opacity,translate,scale,visibility] duration-200 ease-out motion-reduce:transition-none ${
          open
            ? "visible translate-y-0 scale-100 opacity-100"
            : "invisible -translate-y-1 scale-95 opacity-0"
        }`}
      >
        <p className="px-2 pt-1.5 pb-1 text-xs font-medium tracking-wide text-ui-fg-faint uppercase">
          Categories
        </p>

        {categories.length === 0 && (
          <p className="px-2 py-2 text-sm text-ui-fg-muted">No categories yet.</p>
        )}

        {categories.map((category) => {
          const visible = !hidden.includes(category.id);

          return (
            <label
              key={category.id}
              style={accentVars(category.color)}
              className={`${rowClass} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ui-ring`}
            >
              <input
                type="checkbox"
                checked={visible}
                onChange={() => onToggle(category.id)}
                className="sr-only"
              />
              <Checkbox checked={visible} />
              <span
                className={`min-w-0 flex-1 truncate ${visible ? "text-ui-fg" : "text-ui-fg-muted"}`}
              >
                {category.name}
              </span>
              <span className="size-2 shrink-0 rounded-full bg-[var(--accent)]" />
            </label>
          );
        })}

        <div className="mt-1 border-t border-ui-border-soft pt-1">
          <label
            className={`${rowClass} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ui-ring`}
          >
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(event) => onShowHidden(event.target.checked)}
              className="sr-only"
            />
            <Checkbox checked={showHidden} />
            <span
              className={`min-w-0 flex-1 truncate ${showHidden ? "text-ui-fg" : "text-ui-fg-muted"}`}
            >
              Show hidden events
            </span>
          </label>
          <button
            type="button"
            onClick={() => run(onManage)}
            className={`${rowClass} text-ui-fg-muted hover:text-ui-fg`}
          >
            <span className="grid size-4 shrink-0 place-items-center">
              <Icon name="settings" className="size-4" />
            </span>
            Manage categories
          </button>
        </div>
      </div>
    </div>
  );
}
