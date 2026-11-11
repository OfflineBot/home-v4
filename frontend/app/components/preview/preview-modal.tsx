import { useEffect, useRef } from "react";
import { Icon } from "../icons";
import { FilePreview, previewLabel } from "./file-preview";
import { formatBytes } from "../../lib/format";
import type { PreviewSource } from "../../lib/preview";

const iconButtonClass =
  "grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-ui-fg-muted outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring disabled:cursor-not-allowed disabled:opacity-30";

type PreviewModalProps = {
  source: PreviewSource | null;
  downloadUrl?: string;
  detail?: string;
  position?: { index: number; total: number };
  onPrevious?: () => void;
  onNext?: () => void;
  onClose: () => void;
};

export function PreviewModal({
  source,
  downloadUrl,
  detail,
  position,
  onPrevious,
  onNext,
  onClose,
}: PreviewModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = source !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if ((event.target as HTMLElement).closest("input, textarea, select, video, audio")) return;
      if (event.key === "ArrowLeft" && onPrevious) {
        event.preventDefault();
        onPrevious();
      } else if (event.key === "ArrowRight" && onNext) {
        event.preventDefault();
        onNext();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onPrevious, onNext]);

  const meta = source
    ? [previewLabel(source), source.size !== undefined ? formatBytes(source.size) : null, detail]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto h-[min(92vh,64rem)] w-[min(80rem,calc(100%-1.5rem))] max-w-none flex-col overflow-hidden rounded-xl border border-ui-border bg-ui-raised p-0 text-ui-fg backdrop:bg-ui-frame/80 open:flex open:animate-dialog-in backdrop:open:animate-fade-in motion-reduce:open:animate-none"
    >
      {source && (
        <>
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ui-border-soft bg-ui-surface px-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent)]">
              <Icon name="file" className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">{source.name}</h2>
              <p className="truncate text-xs text-ui-fg-muted">{meta}</p>
            </div>
            {position && position.total > 1 && (
              <span className="flex items-center gap-1">
                <button type="button" onClick={onPrevious} disabled={!onPrevious} aria-label="Previous file" className={iconButtonClass}>
                  <Icon name="chevron" className="size-4 rotate-180" />
                </button>
                <span className="w-14 text-center text-xs text-ui-fg-muted tabular-nums">
                  {position.index + 1} / {position.total}
                </span>
                <button type="button" onClick={onNext} disabled={!onNext} aria-label="Next file" className={iconButtonClass}>
                  <Icon name="chevron" className="size-4" />
                </button>
              </span>
            )}
            {source.url && (
              <a href={source.url} target="_blank" rel="noreferrer" aria-label="Open in new tab" title="Open in new tab" className={iconButtonClass}>
                <Icon name="expand" className="size-4" />
              </a>
            )}
            {downloadUrl && (
              <a href={downloadUrl} download={source.name} aria-label="Download" title="Download" className={iconButtonClass}>
                <Icon name="download" className="size-4" />
              </a>
            )}
            <button type="button" onClick={onClose} aria-label="Close" className={iconButtonClass}>
              <Icon name="close" className="size-4" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <FilePreview key={`${source.name}:${source.url ?? ""}`} source={source} />
          </div>
        </>
      )}
    </dialog>
  );
}
