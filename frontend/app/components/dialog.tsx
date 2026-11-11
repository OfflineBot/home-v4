import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icons";

type DialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function Dialog({ open, title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[min(32rem,calc(100%-2rem))] overflow-hidden rounded-xl border border-ui-border bg-ui-raised p-0 text-ui-fg backdrop:bg-ui-frame/70 open:animate-dialog-in backdrop:open:animate-fade-in motion-reduce:open:animate-none"
    >
      <header className="flex items-center gap-3 border-b border-ui-border-soft bg-ui-surface px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-ui-fg-muted outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
        >
          <Icon name="close" className="size-4" />
        </button>
      </header>
      <div className="p-4">{children}</div>
    </dialog>
  );
}
