import { useCallback, useEffect, useState, type DragEvent } from "react";
import { Link } from "react-router";
import { Icon } from "../icons";
import { Badge } from "../block";
import { EntryIcon } from "./entry-icon";
import { filesApi, filesHref, parentPath, pathSegments, type FileEntry, type Usage } from "../../lib/files";
import { formatBytes } from "../../lib/format";

type DropHandlers = {
  onDragOver: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
};

type Children = Record<string, FileEntry[] | "loading" | "error">;

type FolderTreeProps = {
  current: string | null;
  version: unknown;
  dropZone?: (path: string) => DropHandlers;
  dropTarget?: string | null;
  archive: { supported: boolean; count: number };
  archiveActive?: boolean;
  usage: Usage | null;
  onOpenFile?: (entry: FileEntry) => void;
  drawerOpen?: boolean;
  onDrawerClose?: () => void;
};

const fileLimit = 200;

function ancestors(path: string) {
  return ["/", ...pathSegments(path).map((segment) => segment.path)];
}

export function FolderTree({
  current,
  version,
  dropZone,
  dropTarget,
  archive,
  archiveActive = false,
  usage,
  onOpenFile,
  drawerOpen = false,
  onDrawerClose,
}: FolderTreeProps) {
  const [children, setChildren] = useState<Children>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["/"]));

  const load = useCallback(async (path: string) => {
    setChildren((known) => (Array.isArray(known[path]) ? known : { ...known, [path]: "loading" }));
    try {
      const listing = await filesApi.list(path);
      const sorted = [...listing.entries].sort((a, b) =>
        a.type !== b.type
          ? a.type === "dir"
            ? -1
            : 1
          : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
      );
      setChildren((known) => ({ ...known, [path]: sorted }));
    } catch {
      setChildren((known) => ({ ...known, [path]: "error" }));
    }
  }, []);

  useEffect(() => {
    const open = current ? ancestors(current) : ["/"];
    setExpanded((known) => new Set([...known, ...open]));
    for (const path of open) void load(path);
  }, [current, load]);

  useEffect(() => {
    for (const path of expanded) void load(path);
  }, [version]);

  useEffect(() => {
    onDrawerClose?.();
  }, [current]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onDrawerClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen, onDrawerClose]);

  function toggle(path: string) {
    setExpanded((known) => {
      const next = new Set(known);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        if (!Array.isArray(children[path])) void load(path);
      }
      return next;
    });
  }

  function fileNode(entry: FileEntry, depth: number) {
    const style = { paddingLeft: `${depth * 0.875 + 1.75}rem` };
    const className =
      "flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md pr-2 text-left text-[13px] text-ui-fg-muted outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring";
    const content = (
      <>
        <span className="origin-left scale-[0.7]">
          <EntryIcon entry={entry} />
        </span>
        <span className="-ml-2 truncate">{entry.name}</span>
      </>
    );
    return (
      <li key={entry.path}>
        {onOpenFile ? (
          <button type="button" style={style} onClick={() => onOpenFile(entry)} className={className} title={entry.name}>
            {content}
          </button>
        ) : (
          <Link to={filesHref(parentPath(entry.path) ?? "/")} style={style} className={className} title={entry.name}>
            {content}
          </Link>
        )}
      </li>
    );
  }

  function node(path: string, name: string, depth: number, root = false) {
    const list = children[path];
    const open = expanded.has(path);
    const empty = Array.isArray(list) && list.length === 0;
    const active = current === path && !archiveActive;
    const dropping = dropTarget === path;

    return (
      <li key={path}>
        <div
          {...dropZone?.(path)}
          style={{ paddingLeft: `${depth * 0.875 + 0.25}rem` }}
          className={`group flex h-8 items-center gap-0.5 rounded-md pr-2 text-sm transition-colors motion-reduce:transition-none ${
            dropping
              ? "bg-[color-mix(in_oklab,var(--accent)_20%,transparent)] ring-1 ring-[var(--accent)] ring-inset"
              : active
                ? "bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent-fg)]"
                : "text-ui-fg-muted hover:bg-ui-hover hover:text-ui-fg"
          }`}
        >
          <button
            type="button"
            onClick={() => toggle(path)}
            aria-label={open ? `Collapse ${name}` : `Expand ${name}`}
            aria-expanded={open}
            className={`grid size-6 shrink-0 cursor-pointer place-items-center rounded outline-none focus-visible:ring-2 focus-visible:ring-ui-ring ${
              empty ? "invisible" : ""
            }`}
          >
            <Icon
              name="chevron"
              className={`size-3.5 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
            />
          </button>
          <Link
            to={filesHref(path)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-ui-ring"
          >
            <Icon
              name={root ? "home" : "folder"}
              className={`size-4 shrink-0 ${active || dropping ? "text-[var(--accent)]" : "text-ui-fg-faint group-hover:text-[var(--accent)]"}`}
            />
            <span className={`truncate ${active ? "font-medium" : ""}`}>{name}</span>
          </Link>
          {list === "loading" && open && (
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-ui-fg-faint motion-reduce:animate-none" />
          )}
        </div>
        {open && Array.isArray(list) && list.length > 0 && (
          <ul className="flex flex-col">
            {list.filter((entry) => entry.type === "dir").map((entry) => node(entry.path, entry.name, depth + 1))}
            {list
              .filter((entry) => entry.type === "file")
              .slice(0, fileLimit)
              .map((entry) => fileNode(entry, depth + 1))}
            {list.filter((entry) => entry.type === "file").length > fileLimit && (
              <li style={{ paddingLeft: `${(depth + 1) * 0.875 + 1.75}rem` }}>
                <Link to={filesHref(path)} className="block h-7 truncate text-xs leading-7 text-ui-fg-faint hover:text-ui-fg">
                  {list.filter((entry) => entry.type === "file").length - fileLimit} more…
                </Link>
              </li>
            )}
          </ul>
        )}
      </li>
    );
  }

  return (
    <>
    {drawerOpen && (
      <div
        aria-hidden
        onClick={onDrawerClose}
        className="absolute inset-0 z-30 bg-ui-frame/60 animate-fade-in motion-reduce:animate-none lg:hidden"
      />
    )}
    <aside
      aria-label="Folders"
      className={`shrink-0 flex-col border-r border-ui-border-soft ${
        drawerOpen
          ? "absolute inset-y-0 left-0 z-40 flex w-[min(20rem,85%)] bg-ui-raised shadow-2xl shadow-black/30"
          : "hidden"
      } lg:static lg:z-auto lg:flex lg:w-64 lg:bg-transparent lg:shadow-none`}
    >
      <nav className="min-h-0 flex-1 overflow-y-auto p-2">
        <ul className="flex flex-col">{node("/", "Storage", 0, true)}</ul>
      </nav>

      <div className="flex flex-col gap-3 border-t border-ui-border-soft p-2">
        {archive.supported && (
          <Link
            to="/files/archive"
            className={`flex h-8 items-center gap-2 rounded-md px-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none ${
              archiveActive
                ? "bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] font-medium text-[var(--accent-fg)]"
                : "text-ui-fg-muted hover:bg-ui-hover hover:text-ui-fg"
            }`}
          >
            <Icon name="trash" className="size-4" />
            <span className="flex-1">Archive</span>
            {archive.count > 0 && <Badge>{archive.count}</Badge>}
          </Link>
        )}
        {usage && usage.total_bytes > 0 && <UsageMeter usage={usage} />}
      </div>
    </aside>
    </>
  );
}

export function UsageMeter({ usage }: { usage: Usage }) {
  const percent = Math.min(100, (usage.used_bytes / usage.total_bytes) * 100);
  const tone = percent > 90 ? "bg-ui-danger" : percent > 75 ? "bg-ctp-yellow" : "bg-[var(--accent)]";
  return (
    <div className="flex flex-col gap-1.5 px-2 pb-1" title={`${usage.files} files`}>
      <div className="flex items-center justify-between text-xs text-ui-fg-muted">
        <span>Storage</span>
        <span className="tabular-nums">{percent.toFixed(percent < 10 ? 1 : 0)}%</span>
      </div>
      <span className="h-1.5 overflow-hidden rounded-full bg-ui-field" aria-hidden>
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.max(percent, 1)}%` }} />
      </span>
      <span className="text-xs text-ui-fg-faint tabular-nums">
        {formatBytes(usage.used_bytes)} of {formatBytes(usage.total_bytes)}
      </span>
    </div>
  );
}
