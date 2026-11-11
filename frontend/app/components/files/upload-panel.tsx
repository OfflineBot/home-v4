import { useState } from "react";
import { Icon } from "../icons";
import type { UploadItem } from "./use-uploads";
import { formatBytes } from "../../lib/format";

export function UploadPanel({
  items,
  onCancel,
  onClear,
  onDismiss,
}: {
  items: UploadItem[];
  onCancel: (id: number) => void;
  onClear: () => void;
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;

  const active = items.filter((item) => item.status === "queued" || item.status === "uploading");
  const done = items.filter((item) => item.status === "done").length;
  const failed = items.filter((item) => item.status === "error").length;
  const total = items.reduce((sum, item) => sum + item.size, 0);
  const loaded = items.reduce(
    (sum, item) => sum + (item.status === "done" ? item.size : item.status === "uploading" ? item.loaded : 0),
    0,
  );
  const percent = total > 0 ? Math.round((loaded / total) * 100) : 100;
  const title =
    active.length > 0
      ? `Uploading ${done + 1 > items.length ? items.length : done + 1} of ${items.length}`
      : failed > 0
        ? `${done} uploaded, ${failed} failed`
        : `${done} uploaded`;

  return (
    <section
      aria-label="Uploads"
      className="fixed right-3 bottom-3 z-40 w-[min(22rem,calc(100%-1.5rem))] overflow-hidden rounded-xl border border-ui-border bg-ui-raised shadow-xl shadow-black/25 animate-fade-in motion-reduce:animate-none"
    >
      <header className="flex h-11 items-center gap-2 border-b border-ui-border-soft bg-ui-surface px-3">
        <span className="grid size-6 place-items-center text-[var(--accent)]">
          <Icon name={active.length > 0 ? "upload" : failed > 0 ? "alert" : "check"} className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ui-fg">{title}</span>
        {active.length > 0 && <span className="text-xs text-ui-fg-muted tabular-nums">{percent}%</span>}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Collapse uploads" : "Expand uploads"}
          className="grid size-7 cursor-pointer place-items-center rounded-md text-ui-fg-muted outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
        >
          <Icon name="chevron" className={`size-4 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : "-rotate-90"}`} />
        </button>
        <button
          type="button"
          onClick={active.length > 0 ? onDismiss : onClear}
          aria-label={active.length > 0 ? "Cancel all uploads" : "Close uploads"}
          title={active.length > 0 ? "Cancel all" : "Close"}
          className="grid size-7 cursor-pointer place-items-center rounded-md text-ui-fg-muted outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
        >
          <Icon name="close" className="size-4" />
        </button>
      </header>

      {active.length > 0 && (
        <div className="h-0.5 bg-ui-field">
          <div className="h-full bg-[var(--accent)] transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
        </div>
      )}

      {open && (
        <ul className="flex max-h-72 flex-col overflow-y-auto p-1">
          {items.map((item) => {
            const progress = item.size > 0 ? Math.round((item.loaded / item.size) * 100) : 0;
            return (
              <li key={item.id} className="group flex items-center gap-2.5 rounded-md px-2 py-1.5">
                <span
                  className={`grid size-5 shrink-0 place-items-center ${
                    item.status === "done"
                      ? "text-ctp-green"
                      : item.status === "error"
                        ? "text-ui-danger"
                        : item.status === "cancelled"
                          ? "text-ui-fg-faint"
                          : "text-[var(--accent)]"
                  }`}
                >
                  <Icon
                    name={item.status === "done" ? "check" : item.status === "error" ? "alert" : item.status === "cancelled" ? "close" : "file"}
                    className="size-4"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ui-fg" title={item.name}>
                    {item.name}
                  </p>
                  {item.status === "uploading" ? (
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-ui-field">
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
                    </div>
                  ) : (
                    <p className={`truncate text-xs ${item.status === "error" ? "text-ui-danger" : "text-ui-fg-muted"}`}>
                      {item.status === "error"
                        ? item.error
                        : item.status === "queued"
                          ? `Waiting · ${formatBytes(item.size)}`
                          : item.status === "conflict"
                            ? "Already exists"
                            : item.status === "cancelled"
                              ? "Skipped"
                              : formatBytes(item.size)}
                    </p>
                  )}
                </div>
                {(item.status === "queued" || item.status === "uploading") && (
                  <button
                    type="button"
                    onClick={() => onCancel(item.id)}
                    aria-label={`Cancel ${item.name}`}
                    className="grid size-6 shrink-0 cursor-pointer place-items-center rounded text-ui-fg-faint outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
                  >
                    <Icon name="close" className="size-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
