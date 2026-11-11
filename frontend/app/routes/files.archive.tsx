import { useMemo, useState } from "react";
import { Link, useRevalidator } from "react-router";
import type { Route } from "./+types/files.archive";
import { Badge, Block, Stack } from "../components/block";
import { Dialog } from "../components/dialog";
import { EntryIcon } from "../components/files/entry-icon";
import { FolderTree } from "../components/files/folder-tree";
import { Ago } from "../components/git/parts";
import { Icon } from "../components/icons";
import { Page } from "../components/page";
import { buttonClass, dangerButtonClass, primaryButtonClass } from "../components/setting-row";
import { Toast } from "../components/toast";
import { api } from "../lib/api";
import { FilesError, filesApi, parentPath, type ArchiveItem, type Usage } from "../lib/files";
import { readArchive } from "../lib/files.server";
import { formatBytes } from "../lib/format";
import { navColor } from "../lib/nav";
import { requireToken } from "../lib/session";

const dayMs = 86_400_000;

export function meta() {
  return [{ title: "Archive · Files" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const [archive, usage] = await Promise.all([
    readArchive(token),
    api("/api/files/usage", { headers: { Authorization: `Bearer ${token}` } }),
  ]);
  return {
    archive,
    usage: usage.ok ? ((await usage.json()) as Usage) : null,
  };
}

function daysLeft(item: ArchiveItem) {
  return Math.max(0, Math.ceil((Date.parse(item.expires_at) - Date.now()) / dayMs));
}

type Confirm =
  | { kind: "purge"; items: ArchiveItem[] }
  | { kind: "empty" }
  | { kind: "replace"; items: ArchiveItem[] };

export default function ArchivePage({ loaderData }: Route.ComponentProps) {
  const { archive, usage } = loaderData;
  const revalidator = useRevalidator();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState({ message: "", attempt: 0 });

  const items = useMemo(
    () => [...(archive?.items ?? [])].sort((a, b) => b.deleted_at.localeCompare(a.deleted_at)),
    [archive],
  );
  const chosen = items.filter((item) => selected.has(item.id));

  function fail(error: unknown) {
    setFailure((current) => ({
      message: error instanceof Error ? error.message : String(error),
      attempt: current.attempt + 1,
    }));
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function restore(list: ArchiveItem[], overwrite: boolean) {
    setBusy(true);
    const conflicts: ArchiveItem[] = [];
    let failed: unknown = null;
    for (const item of list) {
      try {
        await filesApi.restore(item.id, overwrite);
      } catch (error) {
        if (error instanceof FilesError && error.code === "exists" && !overwrite) conflicts.push(item);
        else failed ??= error;
      }
    }
    setBusy(false);
    setSelected(new Set());
    setConfirm(conflicts.length > 0 ? { kind: "replace", items: conflicts } : null);
    if (failed) fail(failed);
    void revalidator.revalidate();
  }

  async function purge(list: ArchiveItem[]) {
    setBusy(true);
    let failed: unknown = null;
    for (const item of list) {
      try {
        await filesApi.purge(item.id);
      } catch (error) {
        failed ??= error;
      }
    }
    setBusy(false);
    setSelected(new Set());
    setConfirm(null);
    if (failed) fail(failed);
    void revalidator.revalidate();
  }

  async function emptyAll() {
    setBusy(true);
    try {
      await filesApi.emptyArchive();
      setSelected(new Set());
      setConfirm(null);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
      void revalidator.revalidate();
    }
  }

  const info = { supported: archive !== null, count: items.length, retention: archive?.retention_days ?? 90 };

  return (
    <Page
      title="Archive"
      icon="trash"
      color={navColor("files")}
      back={{ to: "/files", label: "Files" }}
      flush={archive !== null}
      actions={
        items.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirm({ kind: "empty" })}
            className={`${dangerButtonClass} inline-flex items-center gap-1.5`}
          >
            <Icon name="trash" className="size-4" />
            <span className="hidden sm:inline">Empty archive</span>
          </button>
        )
      }
    >
      {archive === null ? (
        <Stack>
          <Block>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ui-fg-muted">The archive is not available yet.</p>
              <Link to="/files" className={`${buttonClass} inline-flex items-center`}>
                Open storage
              </Link>
            </div>
          </Block>
        </Stack>
      ) : (
        <div className="relative flex h-full min-h-0">
          <FolderTree current={null} version={archive} archive={info} archiveActive usage={usage} />
          <div className="flex min-w-0 flex-1 flex-col">
            {chosen.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 border-b border-ui-border-soft bg-[color-mix(in_oklab,var(--accent)_9%,var(--ui-surface))] px-4 py-1.5">
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  aria-label="Clear selection"
                  className="grid size-8 cursor-pointer place-items-center rounded-md text-ui-fg-muted outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
                >
                  <Icon name="close" className="size-4" />
                </button>
                <span className="mr-auto text-sm font-medium text-ui-fg">{chosen.length} selected</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void restore(chosen, false)}
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm text-ui-fg outline-none hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring disabled:opacity-40"
                >
                  <Icon name="reply" className="size-4" />
                  Restore
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirm({ kind: "purge", items: chosen })}
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm text-ui-danger outline-none hover:bg-[color-mix(in_oklab,var(--ui-danger)_12%,transparent)] focus-visible:ring-2 focus-visible:ring-ui-ring disabled:opacity-40"
                >
                  <Icon name="trash" className="size-4" />
                  Delete permanently
                </button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto">
              {items.length === 0 ? (
                <div className="grid h-full min-h-64 place-items-center p-6">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <span className="grid size-14 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent)]">
                      <Icon name="trash" className="size-7" />
                    </span>
                    <p className="text-sm text-ui-fg-muted">The archive is empty.</p>
                  </div>
                </div>
              ) : (
                <ul>
                  {items.map((item) => {
                    const left = daysLeft(item);
                    const origin = parentPath(item.original_path) ?? "/";
                    return (
                      <li
                        key={item.id}
                        onClick={() => toggle(item.id)}
                        className={`flex cursor-default items-center gap-3 border-b border-ui-border-soft/60 px-4 py-2.5 transition-colors select-none motion-reduce:transition-none ${
                          selected.has(item.id) ? "bg-[color-mix(in_oklab,var(--accent)_12%,transparent)]" : "hover:bg-ui-hover"
                        }`}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.name}`}
                          checked={selected.has(item.id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggle(item.id)}
                          className="size-4 shrink-0 cursor-pointer accent-[var(--accent)]"
                        />
                        <EntryIcon entry={{ name: item.name, type: item.type }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-ui-fg">{item.name}</p>
                          <p className="truncate font-mono text-xs text-ui-fg-faint">{origin}</p>
                        </div>
                        <span className="hidden shrink-0 text-xs text-ui-fg-muted sm:inline">
                          Deleted <Ago date={item.deleted_at} />
                        </span>
                        <Badge tone={left <= 7 ? "bad" : "neutral"}>
                          {left === 0 ? "Today" : `${left} ${left === 1 ? "day" : "days"} left`}
                        </Badge>
                        <span className="w-16 shrink-0 text-right text-xs text-ui-fg-muted tabular-nums">
                          {item.type === "file" ? formatBytes(item.size) : "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={confirm !== null}
        title={
          confirm?.kind === "empty"
            ? "Empty the archive?"
            : confirm?.kind === "replace"
              ? "Already exists"
              : `Delete ${confirm && "items" in confirm && confirm.items.length === 1 ? "this item" : `${confirm && "items" in confirm ? confirm.items.length : 0} items`} permanently?`
        }
        onClose={() => setConfirm(null)}
      >
        {confirm && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ui-fg">
              {confirm.kind === "empty"
                ? `All ${items.length} items will be deleted permanently. This cannot be undone.`
                : confirm.kind === "replace"
                  ? `${confirm.items.length === 1 ? `"${confirm.items[0].name}"` : `${confirm.items.length} items`} cannot be restored because something with the same name is at the original location. Replace it? The item that is there now moves to the archive.`
                  : "This cannot be undone."}
            </p>
            {"items" in confirm && (
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto font-mono text-xs text-ui-fg-muted">
                {confirm.items.slice(0, 8).map((item) => (
                  <li key={item.id} className="truncate">
                    {item.original_path}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} className={buttonClass}>
                Cancel
              </button>
              {confirm.kind === "replace" ? (
                <button type="button" disabled={busy} onClick={() => void restore(confirm.items, true)} className={primaryButtonClass}>
                  Replace
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => (confirm.kind === "empty" ? void emptyAll() : void purge(confirm.items))}
                  className={dangerButtonClass}
                >
                  {busy ? "Deleting…" : confirm.kind === "empty" ? "Empty archive" : "Delete permanently"}
                </button>
              )}
            </div>
          </div>
        )}
      </Dialog>
      <Toast key={failure.attempt} message={failure.attempt > 0 ? failure.message : null} />
    </Page>
  );
}
