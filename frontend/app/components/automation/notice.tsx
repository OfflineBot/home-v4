import type { ReactNode } from "react";
import { Icon } from "../icons";

type NoticeProps = {
  tone?: "info" | "warn" | "good" | "bad";
  children: ReactNode;
  action?: ReactNode;
};

const tones = {
  info: "border-ui-border-soft bg-ui-surface text-ui-fg-muted",
  warn: "border-[color-mix(in_oklab,var(--ctp-yellow)_45%,transparent)] bg-[color-mix(in_oklab,var(--ctp-yellow)_8%,transparent)] text-ui-fg",
  good: "border-[color-mix(in_oklab,var(--ctp-green)_45%,transparent)] bg-[color-mix(in_oklab,var(--ctp-green)_8%,transparent)] text-ui-fg",
  bad: "border-[color-mix(in_oklab,var(--ui-danger)_45%,transparent)] bg-[color-mix(in_oklab,var(--ui-danger)_8%,transparent)] text-ui-fg",
};

const iconTones = {
  info: "text-ui-fg-faint",
  warn: "text-ctp-yellow",
  good: "text-ctp-green",
  bad: "text-ui-danger",
};

export function Notice({ tone = "info", children, action }: NoticeProps) {
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${tones[tone]}`}>
      <span className={`mt-0.5 grid size-4 shrink-0 place-items-center ${iconTones[tone]}`}>
        <Icon name={tone === "good" ? "check" : "alert"} className="size-4" />
      </span>
      <div className="min-w-0 flex-1 break-words whitespace-pre-line">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export const smallButtonClass =
  "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-ui-border bg-ui-field px-2.5 text-xs text-ui-fg outline-none hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring disabled:cursor-not-allowed disabled:opacity-50";

export const smallDangerClass =
  "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-[color-mix(in_oklab,var(--ui-danger)_40%,transparent)] bg-transparent px-2.5 text-xs text-ui-danger outline-none hover:bg-[color-mix(in_oklab,var(--ui-danger)_12%,transparent)] focus-visible:ring-2 focus-visible:ring-ui-ring disabled:cursor-not-allowed disabled:opacity-50";

export const iconButtonClass =
  "grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-ui-fg-muted outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring disabled:cursor-not-allowed disabled:opacity-40";

export const selectClass =
  "h-9 w-full cursor-pointer rounded-md border border-ui-border-strong bg-ui-field px-2.5 text-sm text-ui-fg outline-none focus:border-ctp-mauve";

export const codeAreaClass =
  "min-h-28 w-full resize-y rounded-md border border-ui-border-strong bg-ui-field px-3 py-2 font-mono text-xs leading-relaxed text-ui-fg outline-none focus:border-ctp-mauve";
