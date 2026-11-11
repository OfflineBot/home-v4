import { useState } from "react";
import { useRevalidator } from "react-router";
import type { Route } from "./+types/pages";
import { Badge, Block, Stack } from "../components/block";
import { Dialog } from "../components/dialog";
import { Ago } from "../components/git/parts";
import { Icon } from "../components/icons";
import { PowerSwitch } from "../components/lights/controls";
import { Page } from "../components/page";
import { PageDialog } from "../components/pages/page-dialog";
import { buttonClass, dangerButtonClass, primaryButtonClass } from "../components/setting-row";
import { Toast } from "../components/toast";
import { api } from "../lib/api";
import { listProjects } from "../lib/git.server";
import { navColor } from "../lib/nav";
import { pageLink, pagesApi, sourceLabel, type SitePage } from "../lib/pages";
import { requireToken } from "../lib/session";

export function meta() {
  return [{ title: "Pages" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const [list, projects] = await Promise.all([
    api("/api/pages/list", { headers: { Authorization: `Bearer ${token}` } }),
    listProjects(token),
  ]);
  const data = list.ok ? ((await list.json().catch(() => null)) as { pages?: SitePage[] | null } | null) : null;
  return {
    pages: data?.pages ?? [],
    failed: !list.ok,
    projects: projects ?? [],
  };
}

const statusBadge: Record<SitePage["status"], { tone: "good" | "neutral" | "bad"; label: string }> = {
  ok: { tone: "good", label: "Live" },
  disabled: { tone: "neutral", label: "Off" },
  source_missing: { tone: "bad", label: "Source missing" },
};

export default function Pages({ loaderData }: Route.ComponentProps) {
  const { pages, failed, projects } = loaderData;
  const revalidator = useRevalidator();
  const [editing, setEditing] = useState<SitePage | null | "new">(null);
  const [removing, setRemoving] = useState<SitePage | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState({ message: "", attempt: 0 });

  function fail(error: unknown) {
    setFailure((current) => ({ message: error instanceof Error ? error.message : "Failed.", attempt: current.attempt + 1 }));
  }

  async function toggle(page: SitePage) {
    setToggling(page.name);
    try {
      await pagesApi.setEnabled(page.name, !page.enabled);
      void revalidator.revalidate();
    } catch (error) {
      fail(error);
    } finally {
      setToggling(null);
    }
  }

  async function remove(page: SitePage) {
    setBusy(true);
    try {
      await pagesApi.remove(page.name);
      setRemoving(null);
      void revalidator.revalidate();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  const sorted = [...pages].sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return (
    <Page
      title="Pages"
      icon="pages"
      color={navColor("pages")}
      actions={
        <button type="button" onClick={() => setEditing("new")} className={`${primaryButtonClass} inline-flex items-center gap-1.5`}>
          <Icon name="plus" className="size-4" />
          <span className="hidden sm:inline">New page</span>
        </button>
      }
    >
      <Stack>
        {failed && (
          <Block>
            <p className="text-sm text-ui-danger">Pages are not reachable right now.</p>
          </Block>
        )}

        {!failed && sorted.length === 0 && (
          <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-ui-border p-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent)]">
                <Icon name="pages" className="size-7" />
              </span>
              <p className="text-sm text-ui-fg-muted">No pages yet.</p>
              <button type="button" onClick={() => setEditing("new")} className={primaryButtonClass}>
                New page
              </button>
            </div>
          </div>
        )}

        {sorted.length > 0 && (
          <ul className="overflow-hidden rounded-xl border border-ui-border bg-ui-raised">
            {sorted.map((page) => {
              const badge = statusBadge[page.status] ?? statusBadge.disabled;
              const link = pageLink(page);
              return (
                <li key={page.name} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ui-border-soft/60 px-4 py-3 last:border-b-0 sm:flex-nowrap">
                  <span
                    className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                      page.status === "ok"
                        ? "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-[var(--accent)]"
                        : page.status === "source_missing"
                          ? "bg-[color-mix(in_oklab,var(--ui-danger)_14%,transparent)] text-ui-danger"
                          : "bg-ui-field text-ui-fg-faint"
                    }`}
                  >
                    <Icon name={page.source === "git" ? "git" : "files"} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-semibold text-ui-fg">{page.title || page.name}</span>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                      {page.spa && <Badge>SPA</Badge>}
                    </div>
                    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ui-fg-muted">
                      {page.status === "ok" ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="flex min-w-0 items-center gap-1 font-mono text-[var(--accent-fg)] hover:underline"
                        >
                          <span className="truncate">{link.replace(/^https?:\/\//, "")}</span>
                          <Icon name="expand" className="size-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="truncate font-mono">{link.replace(/^https?:\/\//, "")}</span>
                      )}
                      <span className="flex min-w-0 items-center gap-1">
                        <Icon name={page.source === "git" ? "branch" : "folder"} className="size-3 shrink-0" />
                        <span className="truncate font-mono">{sourceLabel(page)}</span>
                      </span>
                      <span>
                        Updated <Ago date={page.updated_at} />
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <PowerSwitch
                      on={page.enabled}
                      label={`${page.name} enabled`}
                      disabled={toggling === page.name}
                      onChange={() => void toggle(page)}
                    />
                    <button
                      type="button"
                      onClick={() => setEditing(page)}
                      aria-label={`Edit ${page.name}`}
                      className="grid size-8 cursor-pointer place-items-center rounded-md text-ui-fg-muted outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
                    >
                      <Icon name="edit" className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoving(page)}
                      aria-label={`Delete ${page.name}`}
                      className="grid size-8 cursor-pointer place-items-center rounded-md text-ui-fg-muted outline-none hover:bg-[color-mix(in_oklab,var(--ui-danger)_12%,transparent)] hover:text-ui-danger focus-visible:ring-2 focus-visible:ring-ui-ring"
                    >
                      <Icon name="trash" className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Stack>

      <PageDialog
        open={editing !== null}
        page={editing === "new" ? null : editing}
        projects={projects}
        onSaved={() => {
          setEditing(null);
          void revalidator.revalidate();
        }}
        onClose={() => setEditing(null)}
      />

      <Dialog open={removing !== null} title="Delete page?" onClose={() => setRemoving(null)}>
        {removing && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ui-fg">
              <strong className="font-semibold">{removing.title || removing.name}</strong> goes offline immediately. The source in{" "}
              {removing.source === "git" ? "Git" : "Files"} stays untouched.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRemoving(null)} className={buttonClass}>
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={() => void remove(removing)} className={dangerButtonClass}>
                {busy ? "Deleting…" : "Delete page"}
              </button>
            </div>
          </div>
        )}
      </Dialog>
      <Toast key={failure.attempt} message={failure.attempt > 0 ? failure.message : null} />
    </Page>
  );
}
