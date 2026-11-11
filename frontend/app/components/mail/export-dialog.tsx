import { useEffect, useState } from "react";
import { Dialog } from "../dialog";
import { Icon } from "../icons";
import { buttonClass, primaryButtonClass } from "../setting-row";
import { orderFolders, type MailFolder } from "../../lib/mail";

type Format = "json" | "jsonl";

export function exportHref(format: Format, folders: string[] | null, html: boolean) {
  const params = new URLSearchParams({ format, html: html ? "true" : "false" });
  if (folders) params.set("folders", folders.join(","));
  return `/mail/export?${params}`;
}

export function ExportDialog({
  open,
  folders,
  onClose,
}: {
  open: boolean;
  folders: MailFolder[];
  onClose: () => void;
}) {
  const ordered = orderFolders(folders);
  const [format, setFormat] = useState<Format>("jsonl");
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(folders.map((folder) => folder.id)));
  const [html, setHtml] = useState(false);

  useEffect(() => {
    if (open) setChosen(new Set(folders.map((folder) => folder.id)));
  }, [open, folders]);

  const all = chosen.size === folders.length;
  const count = ordered.filter(({ folder }) => chosen.has(folder.id)).reduce((sum, { folder }) => sum + folder.total, 0);
  const href = exportHref(format, all ? null : [...chosen], html);

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open={open} title="Export mails" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs text-ui-fg-muted">Format</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["jsonl", "JSONL", "One mail per line"],
                ["json", "JSON", "One document"],
              ] as const
            ).map(([value, label, detail]) => (
              <label
                key={value}
                className={`flex cursor-pointer flex-col rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ui-ring motion-reduce:transition-none ${
                  format === value
                    ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]"
                    : "border-ui-border hover:bg-ui-hover"
                }`}
              >
                <input type="radio" name="format" checked={format === value} onChange={() => setFormat(value)} className="sr-only" />
                <span className="font-mono text-sm font-semibold text-ui-fg">{label}</span>
                <span className="text-xs text-ui-fg-muted">{detail}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-1">
          <div className="mb-1 flex items-center justify-between">
            <legend className="text-xs text-ui-fg-muted">Folders</legend>
            <button
              type="button"
              onClick={() => setChosen(all ? new Set() : new Set(folders.map((folder) => folder.id)))}
              className="cursor-pointer text-xs text-[var(--accent-fg)] hover:underline"
            >
              {all ? "None" : "All"}
            </button>
          </div>
          <ul className="flex max-h-56 flex-col overflow-y-auto rounded-lg border border-ui-border bg-ui-field p-1">
            {ordered.map(({ folder, depth }) => (
              <li key={folder.id}>
                <label
                  style={{ paddingLeft: `${0.5 + depth * 1}rem` }}
                  className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md pr-2 text-sm text-ui-fg hover:bg-ui-hover"
                >
                  <input
                    type="checkbox"
                    checked={chosen.has(folder.id)}
                    onChange={() => toggle(folder.id)}
                    className="size-4 cursor-pointer accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  <span className="shrink-0 text-xs text-ui-fg-muted tabular-nums">{folder.total.toLocaleString("en-GB")}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-ui-border p-3">
          <span className="text-sm text-ui-fg">Include HTML</span>
          <input
            type="checkbox"
            checked={html}
            onChange={(event) => setHtml(event.target.checked)}
            className="size-4 cursor-pointer accent-[var(--accent)]"
          />
        </label>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-ui-fg-muted tabular-nums">
            {count.toLocaleString("en-GB")} {count === 1 ? "mail" : "mails"}
          </span>
          <span className="flex gap-2">
            <button type="button" onClick={onClose} className={buttonClass}>
              Cancel
            </button>
            {chosen.size === 0 ? (
              <button type="button" disabled className={`${primaryButtonClass} inline-flex items-center gap-1.5`}>
                <Icon name="download" className="size-4" />
                Download
              </button>
            ) : (
              <a href={href} download onClick={onClose} className={`${primaryButtonClass} inline-flex items-center gap-1.5`}>
                <Icon name="download" className="size-4" />
                Download
              </a>
            )}
          </span>
        </div>
      </div>
    </Dialog>
  );
}
