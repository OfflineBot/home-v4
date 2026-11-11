import type { ReactNode } from "react";

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
