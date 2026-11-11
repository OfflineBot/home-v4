import { useId, useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { accentVars } from "../lib/nav";

// the one module shape used everywhere: a header on the darker surface tone,
// then the body. No page invents its own card.
type BlockProps = {
  title?: string;
  status?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Block({ title, status, children, className = "" }: BlockProps) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-ui-border bg-ui-raised ${className}`}
    >
      {(title || status) && (
        <header className="flex h-10 items-center gap-2.5 border-b border-ui-border-soft bg-ui-surface px-4">
          {title && (
            <h2 className="truncate text-sm font-semibold text-ui-fg">
              {title}
            </h2>
          )}
          {status}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ui-border bg-ui-raised p-4">
      <p className="text-xs font-medium tracking-wide text-ui-fg-muted uppercase">
        {label}
      </p>
      <p className="mt-1 text-3xl font-semibold text-[var(--accent-fg)] tabular-nums">
        {value}
      </p>
    </div>
  );
}

type ExpandableBlockProps = {
  title: string;
  icon: string;
  color: string;
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
};

export function ExpandableBlock({
  title,
  icon,
  color,
  summary,
  children,
  defaultOpen = false,
}: ExpandableBlockProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section
      style={accentVars(color)}
      className="overflow-hidden rounded-xl border border-ui-border bg-ui-raised"
    >
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
          className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left outline-none hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring focus-visible:ring-inset"
        >
          <span className="grid size-6 shrink-0 place-items-center text-[var(--accent)]">
            <Icon name={icon} />
          </span>
          <span className="shrink-0 text-sm font-semibold text-ui-fg">
            {title}
          </span>
          <span className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            {summary}
          </span>
          <span
            className={`grid size-5 shrink-0 place-items-center text-ui-fg-muted transition-transform duration-300 ease-out motion-reduce:transition-none ${
              open ? "rotate-90" : ""
            }`}
          >
            <Icon name="chevron" />
          </span>
        </button>
      </h2>

      <div
        id={bodyId}
        inert={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-ui-border-soft p-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

type BadgeProps = {
  tone?: "neutral" | "accent" | "good" | "bad";
  children: ReactNode;
};

export function Badge({ tone = "neutral", children }: BadgeProps) {
  const tones = {
    neutral: "border-ui-border text-ui-fg-muted",
    accent:
      "border-[color-mix(in_oklab,var(--ctp-mauve)_40%,transparent)] text-ctp-mauve",
    good: "border-[color-mix(in_oklab,var(--ctp-green)_40%,transparent)] text-ctp-green",
    bad: "border-[color-mix(in_oklab,var(--ui-danger)_40%,transparent)] text-ui-danger",
  };

  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-xs ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

type PlaceholderProps = {
  icon: ReactNode;
  hint: string;
};

export function Placeholder({ icon, hint }: PlaceholderProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-ui-border text-ui-fg-faint">
        {icon}
      </span>
      <p className="text-sm text-ui-fg-muted">{hint}</p>
    </div>
  );
}
