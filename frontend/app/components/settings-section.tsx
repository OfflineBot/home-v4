import type { ReactNode } from "react";

// one card per page; sections stack inside it separated by a rule, so a page
// never nests a card in a card
export function SettingsPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-ui-border bg-ui-raised">
      {children}
    </div>
  );
}

type SettingsSectionProps = {
  // omit when the nav entry already says the same thing — no page should
  // repeat its own name as a heading
  title?: string;
  hint?: string;
  status?: ReactNode;
  children: ReactNode;
};

export function SettingsSection({
  title,
  hint,
  status,
  children,
}: SettingsSectionProps) {
  return (
    <section className="border-b border-ui-border-soft px-5 py-4 last:border-b-0">
      {(title || status) && (
        <div className="flex items-center gap-2.5">
          {title && (
            <h2 className="text-sm font-semibold text-ui-fg">{title}</h2>
          )}
          {status}
        </div>
      )}
      {hint && <p className="text-sm text-ui-fg-muted">{hint}</p>}
      <div className={title || hint || status ? "mt-3" : ""}>{children}</div>
    </section>
  );
}

type PlaceholderProps = {
  icon: ReactNode;
  hint: string;
};

export function Placeholder({ icon, hint }: PlaceholderProps) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-ui-border text-ui-fg-faint">
        {icon}
      </span>
      <p className="text-sm text-ui-fg-muted">{hint}</p>
    </div>
  );
}

type BadgeProps = {
  tone?: "neutral" | "accent" | "good";
  children: ReactNode;
};

export function Badge({ tone = "neutral", children }: BadgeProps) {
  const tones = {
    neutral: "border-ui-border text-ui-fg-muted",
    accent:
      "border-[color-mix(in_oklab,var(--ctp-mauve)_40%,transparent)] text-ctp-mauve",
    good: "border-[color-mix(in_oklab,var(--ctp-green)_40%,transparent)] text-ctp-green",
  };

  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-xs ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
