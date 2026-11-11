import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Link, useNavigate, useRevalidator } from "react-router";
import { Icon } from "../icons";
import { Page } from "../page";
import { buttonClass, primaryButtonClass } from "../setting-row";
import { Toast } from "../toast";
import { DeleteDialog, ConflictDialog, MoveDialog, NameDialog } from "./dialogs";
import { PreviewModal } from "../preview/preview-modal";
import { EntryIcon } from "./entry-icon";
import { FolderTree, UsageMeter } from "./folder-tree";
import { UploadPanel } from "./upload-panel";
import { droppedFiles, pickedFiles, useUploads } from "./use-uploads";
import {
  baseName,
  entryKind,
  filesApi,
  filesHref,
  isInside,
  joinPath,
  parentPath,
  pathSegments,
  sortEntries,
  type FileEntry,
  type Listing,
  type SortKey,
  type Usage,
} from "../../lib/files";
import { formatBytes, formatDate, formatDateTime } from "../../lib/format";
import { navColor } from "../../lib/nav";

const internalType = "application/x-home-files";
const viewKey = "files:view";
const refreshMs = 900;

type View = "list" | "grid";

function readView(): View {
  try {
    return window.localStorage.getItem(viewKey) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

function storeView(view: View) {
  try {
    window.localStorage.setItem(viewKey, view);
  } catch {
    return;
  }
}

function hasType(event: DragEvent, type: string) {
  return [...event.dataTransfer.types].includes(type);
}

const iconButtonClass =
  "grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-ui-fg-muted outline-none transition-colors hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none";

const checkboxClass =
  "size-4 shrink-0 cursor-pointer rounded accent-[var(--accent)] focus-visible:outline-2 focus-visible:outline-ui-ring";

export function FileBrowser({
  listing,
  usage,
  archive,
}: {
  listing: Listing;
  usage: Usage | null;
  archive: { supported: boolean; count: number; retention?: number };
}) {
  const archiveRetention = archive.retention ?? 90;
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const refreshTimer = useRef(0);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: "name", descending: false });
  const [query, setQuery] = useState("");
  const [overlay, setOverlay] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<FileEntry | null>(null);
  const [removing, setRemoving] = useState<FileEntry[] | null>(null);
  const [moving, setMoving] = useState<FileEntry[] | null>(null);
  const [preview, setPreview] = useState<FileEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState({ message: "", attempt: 0 });
  const [treeOpen, setTreeOpen] = useState(false);
  const closeTree = useCallback(() => setTreeOpen(false), []);

  const fail = useCallback((error: unknown) => {
    setFailure((current) => ({
      message: error instanceof Error ? error.message : String(error),
      attempt: current.attempt + 1,
    }));
  }, []);

  const refresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = 0;
      void revalidator.revalidate();
    }, refreshMs);
  }, [revalidator]);

  const uploads = useUploads(refresh);

  useEffect(() => setView(readView()), []);

  useEffect(() => {
    setSelected(new Set());
    setAnchor(null);
    setQuery("");
  }, [listing.path]);

  useEffect(() => {
    setSelected((current) => {
      const present = new Set(listing.entries.map((entry) => entry.path));
      const next = new Set([...current].filter((path) => present.has(path)));
      return next.size === current.size ? current : next;
    });
  }, [listing.entries]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? listing.entries.filter((entry) => entry.name.toLowerCase().includes(needle))
      : listing.entries;
    return sortEntries(filtered, sort.key, sort.descending);
  }, [listing.entries, query, sort]);

  const chosen = visible.filter((entry) => selected.has(entry.path));
  const previewable = visible.filter((entry) => entry.type === "file");
  const previewIndex = preview ? previewable.findIndex((entry) => entry.path === preview.path) : -1;
  const folders = listing.entries.filter((entry) => entry.type === "dir").length;
  const fileCount = listing.entries.length - folders;
  const totalSize = listing.entries.reduce((sum, entry) => sum + (entry.type === "file" ? entry.size : 0), 0);

  function changeView(next: View) {
    setView(next);
    storeView(next);
  }

  function open(entry: FileEntry) {
    if (entry.type === "dir") navigate(filesHref(entry.path));
    else setPreview(entry);
  }

  function selectRow(event: ReactMouseEvent, entry: FileEntry) {
    if (event.shiftKey && anchor) {
      const from = visible.findIndex((item) => item.path === anchor);
      const to = visible.findIndex((item) => item.path === entry.path);
      if (from >= 0 && to >= 0) {
        const range = visible.slice(Math.min(from, to), Math.max(from, to) + 1).map((item) => item.path);
        setSelected((current) => new Set([...(event.ctrlKey || event.metaKey ? current : []), ...range]));
        return;
      }
    }
    if (event.ctrlKey || event.metaKey) {
      toggle(entry.path);
      setAnchor(entry.path);
      return;
    }
    setSelected(new Set([entry.path]));
    setAnchor(entry.path);
  }

  function toggle(path: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) =>
      current.size === visible.length ? new Set() : new Set(visible.map((entry) => entry.path)),
    );
  }

  async function createFolder(name: string) {
    setBusy(true);
    try {
      await filesApi.mkdir(joinPath(listing.path, name));
      setCreating(false);
      void revalidator.revalidate();
      return true;
    } catch (error) {
      fail(error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function rename(entry: FileEntry, name: string) {
    if (name === entry.name) {
      setRenaming(null);
      return true;
    }
    setBusy(true);
    try {
      await filesApi.move(entry.path, joinPath(parentPath(entry.path) ?? "/", name));
      setRenaming(null);
      void revalidator.revalidate();
      return true;
    } catch (error) {
      fail(error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function moveTo(paths: string[], folder: string) {
    const targets = paths.filter((path) => parentPath(path) !== folder && !isInside(folder, path));
    if (targets.length === 0) return;
    setBusy(true);
    let failed: unknown = null;
    for (const path of targets) {
      try {
        await filesApi.move(path, joinPath(folder, baseName(path)));
      } catch (error) {
        failed ??= error;
      }
    }
    setBusy(false);
    setMoving(null);
    setSelected(new Set());
    if (failed) fail(failed);
    void revalidator.revalidate();
  }

  async function remove(entries: FileEntry[]) {
    setBusy(true);
    let failed: unknown = null;
    for (const entry of entries) {
      try {
        await filesApi.remove(entry.path);
      } catch (error) {
        failed ??= error;
      }
    }
    setBusy(false);
    setRemoving(null);
    setSelected(new Set());
    if (failed) fail(failed);
    void revalidator.revalidate();
  }

  function download(entries: FileEntry[]) {
    entries.forEach((entry, index) => {
      window.setTimeout(() => {
        const link = document.createElement("a");
        link.href = entry.type === "dir" ? filesApi.archiveHref(entry.path) : filesApi.downloadHref(entry.path);
        link.download = entry.type === "dir" ? `${entry.name}.zip` : entry.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, index * 350);
    });
  }

  async function handleDrop(transfer: DataTransfer, folder: string) {
    const internal = transfer.getData(internalType);
    if (internal) {
      try {
        const paths = JSON.parse(internal);
        if (Array.isArray(paths)) await moveTo(paths.filter((path) => typeof path === "string"), folder);
      } catch {
        return;
      }
      return;
    }
    try {
      uploads.enqueue(folder, await droppedFiles(transfer));
    } catch (error) {
      fail(error);
    }
  }

  function dropZone(folder: string) {
    return {
      onDragOver(event: DragEvent) {
        if (!hasType(event, internalType) && !hasType(event, "Files")) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = hasType(event, internalType) ? "move" : "copy";
        setDropTarget(folder);
      },
      onDragLeave(event: DragEvent) {
        if (!(event.currentTarget as Node).contains(event.relatedTarget as Node | null)) setDropTarget(null);
      },
      onDrop(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        dragDepth.current = 0;
        setOverlay(false);
        setDropTarget(null);
        void handleDrop(event.dataTransfer, folder);
      },
    };
  }

  function dragStart(event: DragEvent, entry: FileEntry) {
    const paths = selected.has(entry.path) ? [...selected] : [entry.path];
    if (!selected.has(entry.path)) setSelected(new Set([entry.path]));
    event.dataTransfer.setData(internalType, JSON.stringify(paths));
    event.dataTransfer.effectAllowed = "move";
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (document.querySelector("dialog[open]")) return;
      if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelected(new Set(visible.map((entry) => entry.path)));
      } else if (event.key === "Escape") {
        setSelected(new Set());
      } else if (event.key === "Delete" && chosen.length > 0) {
        event.preventDefault();
        setRemoving(chosen);
      } else if (event.key === "F2" && chosen.length === 1) {
        event.preventDefault();
        setRenaming(chosen[0]);
      } else if (event.key === "Enter" && chosen.length === 1) {
        event.preventDefault();
        open(chosen[0]);
      } else if (event.key === "Backspace" && listing.parent !== null) {
        event.preventDefault();
        navigate(filesHref(listing.parent));
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const folderName = listing.path === "/" ? "Storage" : baseName(listing.path);

  return (
    <Page
      title="Files"
      icon="files"
      color={navColor("files")}
      flush
      actions={
        <>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className={`${buttonClass} inline-flex items-center gap-1.5`}
          >
            <Icon name="folder" className="size-4" />
            <span className="hidden sm:inline">New folder</span>
          </button>
          <button
            type="button"
            onClick={() => folderInput.current?.click()}
            className={`${buttonClass} inline-flex items-center gap-1.5`}
          >
            <Icon name="upload" className="size-4" />
            <span className="hidden sm:inline">Upload folder</span>
          </button>
          <button
            type="button"
            onClick={() => filesInput.current?.click()}
            className={`${primaryButtonClass} inline-flex items-center gap-1.5`}
          >
            <Icon name="upload" className="size-4" />
            <span className="hidden sm:inline">Upload files</span>
          </button>
          <input
            ref={filesInput}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              uploads.enqueue(listing.path, pickedFiles(event.target.files));
              event.target.value = "";
            }}
          />
          <input
            ref={folderInput}
            type="file"
            hidden
            {...{ webkitdirectory: "", directory: "" }}
            onChange={(event) => {
              uploads.enqueue(listing.path, pickedFiles(event.target.files));
              event.target.value = "";
            }}
          />
        </>
      }
    >
      <div className="relative flex h-full min-h-0">
      <FolderTree
        current={listing.path}
        version={listing}
        dropZone={dropZone}
        dropTarget={dropTarget}
        archive={archive}
        usage={usage}
        onOpenFile={(entry) => {
          setTreeOpen(false);
          setPreview(entry);
        }}
        drawerOpen={treeOpen}
        onDrawerClose={closeTree}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-ui-border-soft px-4 py-2">
          <button
            type="button"
            onClick={() => setTreeOpen(true)}
            aria-label="Show folders"
            title="Folders"
            className={`${iconButtonClass} lg:hidden`}
          >
            <Icon name="menu" className="size-4" />
          </button>
          <nav aria-label="Path" className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 text-sm">
            <button
              type="button"
              onClick={() => navigate(filesHref("/"))}
              {...dropZone("/")}
              className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 outline-none transition-colors hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none ${
                dropTarget === "/" ? "bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] text-[var(--accent-fg)]" : listing.path === "/" ? "font-medium text-ui-fg" : "text-ui-fg-muted"
              }`}
            >
              <Icon name="home" className="size-4" />
              Storage
            </button>
            {pathSegments(listing.path).map((segment, index, all) => (
              <span key={segment.path} className="flex min-w-0 items-center gap-0.5">
                <Icon name="chevron" className="size-3.5 shrink-0 text-ui-fg-faint" />
                <button
                  type="button"
                  onClick={() => navigate(filesHref(segment.path))}
                  {...dropZone(segment.path)}
                  className={`h-8 max-w-48 cursor-pointer truncate rounded-md px-2 outline-none transition-colors hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none ${
                    dropTarget === segment.path
                      ? "bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] text-[var(--accent-fg)]"
                      : index === all.length - 1
                        ? "font-medium text-ui-fg"
                        : "text-ui-fg-muted"
                  }`}
                >
                  {segment.name}
                </button>
              </span>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <label className="relative flex h-8 items-center">
              <span className="pointer-events-none absolute left-2.5 text-ui-fg-faint">
                <Icon name="search" className="size-4" />
              </span>
              <span className="sr-only">Search in {folderName}</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-8 w-40 rounded-md border border-ui-border-strong bg-ui-field pr-2 pl-8 text-sm text-ui-fg outline-none focus:border-[var(--accent)] sm:w-56"
              />
            </label>
            {archive.supported ? (
              <Link
                to="/files/archive"
                title="Archive"
                className="flex h-8 items-center gap-1.5 rounded-md border border-ui-border bg-ui-field px-2 text-sm text-ui-fg-muted outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
              >
                <Icon name="trash" className="size-4" />
                <span className="hidden sm:inline">Archive</span>
                {archive.count > 0 && (
                  <span className="rounded-full bg-ui-raised px-1.5 text-xs tabular-nums">{archive.count}</span>
                )}
              </Link>
            ) : (
              <button
                type="button"
                disabled
                title="The archive is not available right now"
                className="flex h-8 cursor-not-allowed items-center gap-1.5 rounded-md border border-ui-border bg-ui-field px-2 text-sm text-ui-fg-faint opacity-60"
              >
                <Icon name="trash" className="size-4" />
                <span className="hidden sm:inline">Archive</span>
              </button>
            )}
            <div className="flex rounded-md border border-ui-border bg-ui-field p-0.5">
              {(["list", "grid"] as View[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => changeView(option)}
                  aria-pressed={view === option}
                  aria-label={option === "list" ? "List view" : "Grid view"}
                  className={`grid size-7 cursor-pointer place-items-center rounded outline-none focus-visible:ring-2 focus-visible:ring-ui-ring ${
                    view === option ? "bg-ui-raised text-[var(--accent-fg)] shadow-sm" : "text-ui-fg-muted hover:text-ui-fg"
                  }`}
                >
                  <Icon name={option} className="size-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {chosen.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 border-b border-ui-border-soft bg-[color-mix(in_oklab,var(--accent)_9%,var(--ui-surface))] px-4 py-1.5 animate-fade-in motion-reduce:animate-none">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              aria-label="Clear selection"
              className={iconButtonClass}
            >
              <Icon name="close" className="size-4" />
            </button>
            <span className="mr-auto text-sm font-medium text-ui-fg">
              {chosen.length} selected
            </span>
            <SelectionAction icon="download" label="Download" onClick={() => download(chosen)} />
            <SelectionAction icon="move" label="Move" onClick={() => setMoving(chosen)} />
            <SelectionAction
              icon="edit"
              label="Rename"
              disabled={chosen.length !== 1}
              onClick={() => setRenaming(chosen[0])}
            />
            <SelectionAction icon="trash" label="Delete" danger onClick={() => setRemoving(chosen)} />
          </div>
        )}

        <div
          className="relative min-h-0 flex-1 overflow-auto"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelected(new Set());
          }}
          onDragEnter={(event) => {
            if (!hasType(event, "Files")) return;
            dragDepth.current += 1;
            setOverlay(true);
          }}
          onDragLeave={(event) => {
            if (!hasType(event, "Files")) return;
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setOverlay(false);
          }}
          {...{ onDragOver: dropZone(listing.path).onDragOver, onDrop: dropZone(listing.path).onDrop }}
        >
          {visible.length === 0 ? (
            <EmptyState
              searching={query.trim() !== ""}
              onUpload={() => filesInput.current?.click()}
              onCreate={() => setCreating(true)}
            />
          ) : view === "list" ? (
            <div role="grid" aria-label={folderName} aria-multiselectable className="min-w-0">
              <div
                role="row"
                className="sticky top-0 z-10 grid grid-cols-[2.5rem_minmax(0,1fr)_5.5rem] items-center border-b border-ui-border-soft bg-ui-surface/95 px-2 text-xs font-medium text-ui-fg-muted backdrop-blur sm:grid-cols-[2.5rem_minmax(0,1fr)_10rem_6.5rem]"
              >
                <span role="columnheader" className="grid h-9 place-items-center">
                  <HeaderCheckbox count={chosen.length} total={visible.length} onToggle={toggleAll} />
                </span>
                <SortHeader label="Name" sortKey="name" sort={sort} onSort={setSort} />
                <SortHeader label="Modified" sortKey="modified" sort={sort} onSort={setSort} className="hidden sm:flex" />
                <SortHeader label="Size" sortKey="size" sort={sort} onSort={setSort} align="right" />
              </div>
              {visible.map((entry) => (
                <ListRow
                  key={entry.path}
                  entry={entry}
                  selected={selected.has(entry.path)}
                  dropping={dropTarget === entry.path}
                  dropProps={entry.type === "dir" ? dropZone(entry.path) : undefined}
                  onSelect={(event) => selectRow(event, entry)}
                  onToggle={() => {
                    toggle(entry.path);
                    setAnchor(entry.path);
                  }}
                  onOpen={() => open(entry)}
                  onDragStart={(event) => dragStart(event, entry)}
                />
              ))}
            </div>
          ) : (
            <div
              role="grid"
              aria-label={folderName}
              aria-multiselectable
              className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 p-4"
            >
              {visible.map((entry) => (
                <GridTile
                  key={entry.path}
                  entry={entry}
                  selected={selected.has(entry.path)}
                  dropping={dropTarget === entry.path}
                  dropProps={entry.type === "dir" ? dropZone(entry.path) : undefined}
                  onSelect={(event) => selectRow(event, entry)}
                  onToggle={() => {
                    toggle(entry.path);
                    setAnchor(entry.path);
                  }}
                  onOpen={() => open(entry)}
                  onDragStart={(event) => dragStart(event, entry)}
                />
              ))}
            </div>
          )}

          {overlay && (
            <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-xl border-2 border-dashed border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] animate-fade-in motion-reduce:animate-none">
              <div className="flex flex-col items-center gap-2 text-[var(--accent-fg)]">
                <Icon name="upload" className="size-8" />
                <p className="text-sm font-medium">
                  Drop to upload to {dropTarget && dropTarget !== listing.path ? baseName(dropTarget) || "Storage" : folderName}
                </p>
              </div>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ui-border-soft px-4 py-2 text-xs text-ui-fg-muted">
          <span className="tabular-nums">
            {folders} {folders === 1 ? "folder" : "folders"} · {fileCount} {fileCount === 1 ? "file" : "files"}
            {totalSize > 0 && ` · ${formatBytes(totalSize)}`}
          </span>
          {usage && usage.total_bytes > 0 && (
            <span className="ml-auto w-48 lg:hidden">
              <UsageMeter usage={usage} />
            </span>
          )}
        </footer>
      </div>
      </div>

      <NameDialog
        open={creating}
        title="New folder"
        action="Create"
        initial=""
        busy={busy}
        onSubmit={createFolder}
        onClose={() => setCreating(false)}
      />
      <NameDialog
        open={renaming !== null}
        title="Rename"
        action="Rename"
        initial={renaming?.name ?? ""}
        busy={busy}
        onSubmit={(name) => (renaming ? rename(renaming, name) : Promise.resolve(false))}
        onClose={() => setRenaming(null)}
      />
      <DeleteDialog
        entries={removing}
        archive={{ supported: archive.supported, retention: archiveRetention }}
        busy={busy}
        onConfirm={() => removing && void remove(removing)}
        onClose={() => setRemoving(null)}
      />
      <MoveDialog
        entries={moving}
        start={listing.path}
        busy={busy}
        onMove={(folder) => moving && void moveTo(moving.map((entry) => entry.path), folder)}
        onClose={() => setMoving(null)}
      />
      <PreviewModal
        source={
          preview
            ? { name: preview.name, url: filesApi.previewHref(preview.path), mime: preview.mime_type, size: preview.size }
            : null
        }
        downloadUrl={preview ? filesApi.downloadHref(preview.path) : undefined}
        detail={preview ? formatDateTime(preview.modified) : undefined}
        position={previewIndex >= 0 ? { index: previewIndex, total: previewable.length } : undefined}
        onPrevious={previewIndex > 0 ? () => setPreview(previewable[previewIndex - 1]) : undefined}
        onNext={previewIndex >= 0 && previewIndex < previewable.length - 1 ? () => setPreview(previewable[previewIndex + 1]) : undefined}
        onClose={() => setPreview(null)}
      />
      <ConflictDialog
        names={uploads.conflicts.map((item) => item.name)}
        onReplace={() => uploads.resolveConflicts(true)}
        onSkip={() => uploads.resolveConflicts(false)}
      />
      <UploadPanel items={uploads.items} onCancel={uploads.cancel} onClear={uploads.clear} onDismiss={uploads.dismiss} />
      <Toast key={failure.attempt} message={failure.attempt > 0 ? failure.message : null} />
    </Page>
  );
}

function SelectionAction({
  icon,
  label,
  danger,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-ring disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none ${
        danger
          ? "text-ui-danger hover:bg-[color-mix(in_oklab,var(--ui-danger)_12%,transparent)]"
          : "text-ui-fg hover:bg-ui-hover"
      }`}
    >
      <Icon name={icon} className="size-4" />
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

function HeaderCheckbox({ count, total, onToggle }: { count: number; total: number; onToggle: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = count > 0 && count < total;
  }, [count, total]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Select all"
      checked={total > 0 && count === total}
      onChange={onToggle}
      className={checkboxClass}
    />
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; descending: boolean };
  onSort: (sort: { key: SortKey; descending: boolean }) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <span
      role="columnheader"
      aria-sort={active ? (sort.descending ? "descending" : "ascending") : "none"}
      className={`flex ${align === "right" ? "justify-end" : ""} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort({ key: sortKey, descending: active ? !sort.descending : sortKey !== "name" })}
        className={`flex h-9 cursor-pointer items-center gap-1 rounded px-1 outline-none hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring ${
          active ? "text-ui-fg" : ""
        }`}
      >
        {label}
        <Icon
          name="chevron"
          className={`size-3 transition-transform motion-reduce:transition-none ${active ? "" : "opacity-0"} ${
            sort.descending ? "rotate-90" : "-rotate-90"
          }`}
        />
      </button>
    </span>
  );
}

type ItemProps = {
  entry: FileEntry;
  selected: boolean;
  dropping: boolean;
  dropProps?: {
    onDragOver: (event: DragEvent) => void;
    onDragLeave: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
  };
  onSelect: (event: ReactMouseEvent) => void;
  onToggle: () => void;
  onOpen: () => void;
  onDragStart: (event: DragEvent) => void;
};

function itemTone(selected: boolean, dropping: boolean) {
  if (dropping) return "bg-[color-mix(in_oklab,var(--accent)_20%,transparent)] ring-1 ring-[var(--accent)] ring-inset";
  if (selected) return "bg-[color-mix(in_oklab,var(--accent)_12%,transparent)]";
  return "hover:bg-ui-hover";
}

function ListRow({ entry, selected, dropping, dropProps, onSelect, onToggle, onOpen, onDragStart }: ItemProps) {
  const kind = entryKind(entry);
  return (
    <div
      role="row"
      aria-selected={selected}
      draggable
      onDragStart={onDragStart}
      onClick={onSelect}
      onDoubleClick={onOpen}
      {...dropProps}
      className={`grid cursor-default grid-cols-[2.5rem_minmax(0,1fr)_5.5rem] items-center border-b border-ui-border-soft/60 px-2 transition-colors select-none motion-reduce:transition-none sm:grid-cols-[2.5rem_minmax(0,1fr)_10rem_6.5rem] ${itemTone(selected, dropping)}`}
    >
      <span role="gridcell" className="grid h-12 place-items-center" onClick={(event) => event.stopPropagation()}>
        <input
          type="checkbox"
          aria-label={`Select ${entry.name}`}
          checked={selected}
          onChange={onToggle}
          className={checkboxClass}
        />
      </span>
      <span role="gridcell" className="flex min-w-0 items-center gap-3 pr-3">
        <EntryIcon entry={entry} />
        <span className="flex min-w-0 flex-col">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
            className="w-fit max-w-full cursor-pointer truncate text-left text-sm text-ui-fg outline-none hover:text-[var(--accent-fg)] hover:underline focus-visible:ring-2 focus-visible:ring-ui-ring"
          >
            {entry.name}
          </button>
          <span className="truncate text-xs text-ui-fg-faint sm:hidden">{formatDate(entry.modified)}</span>
        </span>
        {entry.type === "file" && (
          <span className="hidden shrink-0 rounded border border-ui-border-soft px-1.5 text-[10px] font-medium tracking-wide text-ui-fg-faint uppercase lg:inline">
            {kind.label}
          </span>
        )}
      </span>
      <span role="gridcell" className="hidden truncate text-sm text-ui-fg-muted tabular-nums sm:block" title={formatDateTime(entry.modified)}>
        {formatDate(entry.modified)}
      </span>
      <span role="gridcell" className="truncate pr-2 text-right text-sm text-ui-fg-muted tabular-nums">
        {entry.type === "dir" ? "—" : formatBytes(entry.size)}
      </span>
    </div>
  );
}

function GridTile({ entry, selected, dropping, dropProps, onSelect, onToggle, onOpen, onDragStart }: ItemProps) {
  const kind = entryKind(entry);
  return (
    <div
      role="gridcell"
      aria-selected={selected}
      draggable
      onDragStart={onDragStart}
      onClick={onSelect}
      onDoubleClick={onOpen}
      {...dropProps}
      className={`group relative flex cursor-default flex-col gap-2 rounded-xl border p-2 transition-colors select-none motion-reduce:transition-none ${
        selected || dropping ? "border-[var(--accent)]" : "border-ui-border-soft"
      } ${itemTone(selected, dropping)}`}
    >
      <span className="absolute top-3 left-3 z-10" onClick={(event) => event.stopPropagation()}>
        <input
          type="checkbox"
          aria-label={`Select ${entry.name}`}
          checked={selected}
          onChange={onToggle}
          className={`${checkboxClass} ${selected ? "" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
        />
      </span>
      <span className="grid aspect-[4/3] place-items-center overflow-hidden rounded-lg bg-ui-field">
        {kind.preview === "image" ? (
          <img src={filesApi.previewHref(entry.path)} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
        ) : (
          <EntryIcon entry={entry} large />
        )}
      </span>
      <span className="flex min-w-0 flex-col px-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          title={entry.name}
          className="w-fit max-w-full cursor-pointer truncate text-left text-sm text-ui-fg outline-none hover:text-[var(--accent-fg)] focus-visible:ring-2 focus-visible:ring-ui-ring"
        >
          {entry.name}
        </button>
        <span className="truncate text-xs text-ui-fg-faint">
          {entry.type === "dir" ? formatDate(entry.modified) : `${formatBytes(entry.size)} · ${formatDate(entry.modified)}`}
        </span>
      </span>
    </div>
  );
}

function EmptyState({
  searching,
  onUpload,
  onCreate,
}: {
  searching: boolean;
  onUpload: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="grid h-full min-h-64 place-items-center p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent)]">
          <Icon name={searching ? "search" : "folder"} className="size-7" />
        </span>
        <p className="text-sm text-ui-fg-muted">{searching ? "Nothing matches." : "This folder is empty."}</p>
        {!searching && (
          <div className="flex gap-2">
            <button type="button" onClick={onCreate} className={buttonClass}>
              New folder
            </button>
            <button type="button" onClick={onUpload} className={primaryButtonClass}>
              Upload files
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
