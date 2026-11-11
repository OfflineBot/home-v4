import type { ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "./icons";
import { accentVars } from "../lib/nav";

type PageProps = {
  title: string;
  color?: string;
  icon?: string;
  back?: { to: string; label: string };
  actions?: ReactNode;
  flush?: boolean;
  children: ReactNode;
};

export function Page({
  title,
  color = "mauve",
  icon,
  back,
  actions,
  flush = false,
  children,
}: PageProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" style={accentVars(color)}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-ui-border bg-ui-surface">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-ui-border px-4">
          {back && (
            <Link
              to={back.to}
              aria-label={back.label}
              title={back.label}
              className="-ml-2 flex h-8 shrink-0 items-center gap-1 rounded-md pr-2 pl-1 text-sm text-ui-fg-muted outline-none transition-colors hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none"
            >
              <Icon name="chevron" className="size-4 rotate-180" />
              <span className="hidden sm:inline">{back.label}</span>
            </Link>
          )}
          {back && <span className="h-5 w-px shrink-0 bg-ui-border" aria-hidden />}
          <h1 className="flex min-w-0 items-center gap-2.5 text-base font-semibold text-[var(--accent-fg)]">
            {icon && (
              <span className="grid size-6 shrink-0 place-items-center text-[var(--accent)]">
                <Icon name={icon} />
              </span>
            )}
            <span className="truncate">{title}</span>
          </h1>
          {actions && (
            <div className="ml-auto flex items-center gap-2">{actions}</div>
          )}
        </header>

        <div
          className={`min-h-0 flex-1 ${flush ? "overflow-hidden" : "overflow-auto p-4"}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
