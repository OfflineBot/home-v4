import type { ReactNode } from "react";

type PanelProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export function Panel({ title, children, className = "" }: PanelProps) {
  return (
    <section
      className={`rounded-lg border border-ctp-surface0 bg-ctp-base p-4 ${className}`}
    >
      {title && (
        <h2 className="mb-3 text-xs font-medium tracking-wide text-ctp-overlay0 uppercase">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
