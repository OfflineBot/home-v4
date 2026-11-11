import type { ReactNode } from "react";
import { Icon } from "./icons";
import { accentVars } from "../lib/nav";

type PageProps = {
  title: string;
  color?: string;
  icon?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function Page({
  title,
  color = "mauve",
  icon,
  actions,
  children,
}: PageProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" style={accentVars(color)}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-ui-border bg-ui-surface">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-ui-border px-4">
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

        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}
