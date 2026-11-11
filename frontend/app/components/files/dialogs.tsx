import { useEffect, useRef, useState } from "react";
import { Dialog } from "../dialog";
import { Icon } from "../icons";
import {
  Field,
  buttonClass,
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
} from "../setting-row";
import { EntryIcon } from "./entry-icon";
import {
  filesApi,
  isInside,
  joinPath,
  nameError,
  parentPath,
  pathSegments,
  type FileEntry,
} from "../../lib/files";
import { formatBytes } from "../../lib/format";

const flashMs = 1600;

export function NameDialog({
  open,
  title,
  action,
  initial,
  busy,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  action: string;
  initial: string;
  busy: boolean;
  onSubmit: (name: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const frame = requestAnimationFrame(() => {
      const field = input.current;
      if (!field) return;
      field.value = initial;
      field.focus();
      const dot = initial.lastIndexOf(".");
      field.setSelectionRange(0, dot > 0 ? dot : initial.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, initial]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(false), flashMs);
    return () => window.clearTimeout(timer);
  }, [flash]);

  async function submit() {
    const value = input.current?.value ?? "";
    const problem = nameError(value);
    if (problem) {
      setError(problem);
      setFlash(true);
      return;
    }
    if (!(await onSubmit(value.trim()))) setFlash(true);
  }

  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Name">
          <input
            ref={input}
            autoComplete="off"
            spellCheck={false}
            onInput={() => setError(null)}
            className={`${inputClass} transition-colors duration-300 motion-reduce:transition-none ${
              flash ? "border-ui-danger!" : ""
            }`}
          />
        </Field>
        {error && <p className="-mt-2 text-xs text-ui-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClass}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={primaryButtonClass}>
            {action}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

type Contents = { folders: number; files: number; bytes: number; truncated: boolean };

const countLimit = 5000;

async function countContents(entries: FileEntry[]): Promise<Contents> {
  const result: Contents = { folders: 0, files: 0, bytes: 0, truncated: false };
  const queue = entries.filter((entry) => entry.type === "dir").map((entry) => entry.path);
  while (queue.length > 0) {
    if (result.folders + result.files >= countLimit) {
      result.truncated = true;
      break;
    }
    const listing = await filesApi.list(queue.shift()!);
    for (const child of listing.entries) {
      if (child.type === "dir") {
        result.folders += 1;
        queue.push(child.path);
      } else {
        result.files += 1;
        result.bytes += child.size;
      }
    }
  }
  return result;
}

function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? one : many}`;
}

export function DeleteDialog({
  entries,
  archive,
  busy,
  onConfirm,
  onClose,
}: {
  entries: FileEntry[] | null;
  archive: { supported: boolean; retention: number };
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const list = entries ?? [];
  const folders = list.filter((entry) => entry.type === "dir");
  const [contents, setContents] = useState<Contents | "loading" | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    setConfirmed(false);
    setContents(null);
    if (!entries || !entries.some((entry) => entry.type === "dir")) return;
    let cancelled = false;
    setContents("loading");
    countContents(entries)
      .then((result) => !cancelled && setContents(result))
      .catch(() => !cancelled && setContents({ folders: 0, files: 0, bytes: 0, truncated: true }));
    return () => {
      cancelled = true;
    };
  }, [entries]);

  const nested = contents !== null && contents !== "loading" && (contents.folders > 0 || contents.files > 0 || contents.truncated);
  const needsConfirm = folders.length > 0 && (nested || contents === "loading");
  const noun = list.length === 1 ? (list[0].type === "dir" ? "folder" : "file") : `${list.length} items`;
  const title = archive.supported
    ? `Move ${list.length === 1 ? "this " + noun : noun} to the archive?`
    : `Delete ${list.length === 1 ? "this " + noun : noun} permanently?`;

  return (
    <Dialog open={entries !== null} title={title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {list.slice(0, 8).map((entry) => (
            <li key={entry.path} className="flex min-w-0 items-center gap-2.5">
              <EntryIcon entry={entry} />
              <span className="min-w-0 flex-1 truncate text-sm text-ui-fg">{entry.name}</span>
              {entry.type === "file" && (
                <span className="shrink-0 text-xs text-ui-fg-muted tabular-nums">{formatBytes(entry.size)}</span>
              )}
            </li>
          ))}
          {list.length > 8 && <li className="pl-10.5 text-xs text-ui-fg-muted">and {list.length - 8} more</li>}
        </ul>

        {folders.length > 0 && (
          <div className="flex flex-col gap-3 rounded-lg border border-[color-mix(in_oklab,var(--ui-danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--ui-danger)_8%,transparent)] p-3">
            <p className="text-sm text-ui-fg">
              {contents === "loading" || contents === null ? (
                "Counting what is inside…"
              ) : nested ? (
                <>
                  {folders.length === 1 ? "This folder contains" : "These folders contain"}{" "}
                  <strong className="font-semibold">
                    {plural(contents.folders, "folder", "folders")} and {plural(contents.files, "file", "files")}
                  </strong>
                  {contents.bytes > 0 && ` (${formatBytes(contents.bytes)})`}
                  {contents.truncated && " or more"}.
                </>
              ) : (
                `${folders.length === 1 ? "The folder is" : "The folders are"} empty.`
              )}
            </p>
            {needsConfirm && (
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ui-fg">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={contents === "loading"}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--ui-danger)]"
                />
                {archive.supported
                  ? "Everything inside goes to the archive too"
                  : "Everything inside will be deleted too"}
              </label>
            )}
          </div>
        )}

        <p className="text-sm text-ui-fg-muted">
          {archive.supported
            ? `Items stay in the archive for ${archive.retention} days and can be restored there.`
            : "This cannot be undone."}
        </p>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClass}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || (needsConfirm && !confirmed)}
            onClick={onConfirm}
            className={dangerButtonClass}
          >
            {busy ? "Working…" : archive.supported ? "Move to archive" : "Delete permanently"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function ConflictDialog({
  names,
  onReplace,
  onSkip,
}: {
  names: string[];
  onReplace: () => void;
  onSkip: () => void;
}) {
  return (
    <Dialog
      open={names.length > 0}
      title={names.length === 1 ? "File already exists" : `${names.length} files already exist`}
      onClose={onSkip}
    >
      <div className="flex flex-col gap-4">
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto font-mono text-xs text-ui-fg">
          {names.slice(0, 10).map((name) => (
            <li key={name} className="truncate">
              {name}
            </li>
          ))}
          {names.length > 10 && <li className="text-ui-fg-muted">and {names.length - 10} more</li>}
        </ul>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onSkip} className={buttonClass}>
            Skip
          </button>
          <button type="button" onClick={onReplace} className={primaryButtonClass}>
            Replace
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function MoveDialog({
  entries,
  start,
  busy,
  onMove,
  onClose,
}: {
  entries: FileEntry[] | null;
  start: string;
  busy: boolean;
  onMove: (target: string) => void;
  onClose: () => void;
}) {
  const [path, setPath] = useState(start);
  const [folders, setFolders] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = entries !== null;
  const moving = entries ?? [];

  useEffect(() => {
    if (open) setPath(start);
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

  const blocked = (target: string) =>
    moving.some((entry) => entry.type === "dir" && isInside(target, entry.path));
  const unchanged = moving.every((entry) => parentPath(entry.path) === path);
  const title = moving.length === 1 ? `Move ${moving[0].name}` : `Move ${moving.length} items`;

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
              {folders.map((folder) => {
                const disabled = blocked(folder.path);
                return (
                  <li key={folder.path}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setPath(folder.path)}
                      className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-md px-2 text-left text-sm text-ui-fg outline-none hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <EntryIcon entry={folder} />
                      <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                      <Icon name="chevron" className="size-4 shrink-0 text-ui-fg-faint" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClass}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || unchanged || blocked(path)}
            onClick={() => onMove(path)}
            className={`${primaryButtonClass} inline-flex items-center gap-1.5`}
          >
            <Icon name="move" className="size-4" />
            {busy ? "Moving…" : "Move here"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function moveTarget(folder: string, entry: FileEntry) {
  return joinPath(folder, entry.name);
}
