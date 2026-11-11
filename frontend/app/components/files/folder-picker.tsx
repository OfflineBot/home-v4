import { useEffect, useState } from "react";
import { Dialog } from "../dialog";
import { Icon } from "../icons";
import { buttonClass, primaryButtonClass } from "../setting-row";
import { EntryIcon } from "./entry-icon";
import { filesApi, pathSegments, type FileEntry } from "../../lib/files";

export function FolderPickerDialog({
  open,
  start,
  title,
  onPick,
  onClose,
}: {
  open: boolean;
  start: string;
  title: string;
  onPick: (path: string) => void;
  onClose: () => void;
}) {
  const [path, setPath] = useState(start || "/");
  const [folders, setFolders] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setPath(start || "/");
  }, [open, start]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFolders(null);
    setError(null);
    filesApi
      .list(path)
      .then((listing) => {
        if (cancelled) return;
        setFolders(
          listing.entries
            .filter((entry) => entry.type === "dir")
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
        );
      })
      .catch((problem) => !cancelled && setError(problem instanceof Error ? problem.message : "Failed."));
    return () => {
      cancelled = true;
    };
  }, [open, path]);

  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <nav aria-label="Folder" className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
          <button
            type="button"
            onClick={() => setPath("/")}
            className="flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 text-ui-fg-muted outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
          >
            <Icon name="home" className="size-4" />
            <span className="sr-only">Storage</span>
          </button>
          {pathSegments(path).map((segment) => (
            <span key={segment.path} className="flex min-w-0 items-center gap-0.5">
              <Icon name="chevron" className="size-3.5 shrink-0 text-ui-fg-faint" />
              <button
                type="button"
                onClick={() => setPath(segment.path)}
                className="h-7 max-w-40 cursor-pointer truncate rounded-md px-1.5 text-ui-fg outline-none hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring"
              >
                {segment.name}
              </button>
            </span>
          ))}
        </nav>

        <div className="h-64 overflow-y-auto rounded-lg border border-ui-border bg-ui-field p-1">
          {error ? (
            <p className="p-3 text-sm text-ui-danger">{error}</p>
          ) : folders === null ? (
            <p className="p-3 text-sm text-ui-fg-muted">Loading…</p>
          ) : folders.length === 0 ? (
            <p className="p-3 text-sm text-ui-fg-muted">No folders here.</p>
          ) : (
            <ul className="flex flex-col">
              {folders.map((folder) => (
                <li key={folder.path}>
                  <button
                    type="button"
                    onClick={() => setPath(folder.path)}
                    className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-md px-2 text-left text-sm text-ui-fg outline-none hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring"
                  >
                    <EntryIcon entry={folder} />
                    <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                    <Icon name="chevron" className="size-4 shrink-0 text-ui-fg-faint" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-mono text-xs text-ui-fg-muted">{path}</span>
          <span className="flex gap-2">
            <button type="button" onClick={onClose} className={buttonClass}>
              Cancel
            </button>
            <button type="button" onClick={() => onPick(path)} className={primaryButtonClass}>
              Use this folder
            </button>
          </span>
        </div>
      </div>
    </Dialog>
  );
}
