import type { ReactNode } from "react";

type SettingRowProps = {
  label: string;
  hint?: string;
  control?: ReactNode;
  children?: ReactNode;
};

// label, then the inputs, then the action directly below them — the pointer
// never has to travel across the card to reach the button it just typed into
export function SettingRow({
  label,
  hint,
  control,
  children,
}: SettingRowProps) {
  return (
    <div className="border-b border-ui-border-soft py-4 last:border-b-0">
      <p className="text-sm font-medium text-ui-fg">{label}</p>
      {hint && (
        <p className="mt-0.5 text-sm text-ui-fg-muted">{hint}</p>
      )}
      {children}
      {control && <div className="mt-3 flex flex-wrap gap-2">{control}</div>}
    </div>
  );
}

type FieldProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

export function Field({ label, children, className = "" }: FieldProps) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="text-xs text-ui-fg-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "h-9 w-full rounded-md border border-ui-border-strong bg-ui-field px-3 text-sm text-ui-fg outline-none focus:border-ctp-mauve";

export const textareaClass =
  "min-h-20 w-full resize-y rounded-md border border-ui-border-strong bg-ui-field px-3 py-2 text-sm text-ui-fg outline-none focus:border-ctp-mauve";

export const buttonClass =
  "h-9 shrink-0 cursor-pointer rounded-md border border-ui-border bg-ui-field px-3 text-sm text-ui-fg outline-none hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring disabled:cursor-not-allowed disabled:opacity-50";

export const primaryButtonClass =
  "h-9 shrink-0 cursor-pointer rounded-md bg-ctp-mauve px-4 text-sm font-medium text-ui-frame outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ui-ring disabled:cursor-not-allowed disabled:opacity-50";

export const dangerButtonClass =
  "h-9 shrink-0 cursor-pointer rounded-md border border-[color-mix(in_oklab,var(--ui-danger)_40%,transparent)] bg-transparent px-3 text-sm text-ui-danger outline-none hover:bg-[color-mix(in_oklab,var(--ui-danger)_12%,transparent)] focus-visible:ring-2 focus-visible:ring-ui-ring disabled:cursor-not-allowed disabled:opacity-50";

// the column that holds inputs; keeps fields and their button on one axis
export const fieldStackClass = "mt-3 flex flex-col gap-2";

export const fieldGridClass = "grid gap-3 sm:grid-cols-2";
