import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/git";
import { Badge, Block, Stack } from "../components/block";
import { NewRepoDialog } from "../components/git/new-repo-dialog";
import { Ago } from "../components/git/parts";
import { Icon } from "../components/icons";
import { Page } from "../components/page";
import { buttonClass, primaryButtonClass } from "../components/setting-row";
import { repoHref } from "../lib/git";
import { listProjects } from "../lib/git.server";
import { navColor } from "../lib/nav";
import { requireToken } from "../lib/session";

export function meta() {
  return [{ title: "Git" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const projects = await listProjects(token);
  return { projects: projects ?? [], failed: projects === null };
}

export default function Git({ loaderData }: Route.ComponentProps) {
  const { projects, failed } = loaderData;
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState<{ project?: string } | null>(null);
  const needle = query.trim().toLowerCase();
  const total = projects.reduce((sum, project) => sum + project.repos.length, 0);

  const shown = projects
    .map((project) => ({
      ...project,
      repos: project.repos.filter(
        (repo) =>
          !needle ||
          repo.name.toLowerCase().includes(needle) ||
          repo.description.toLowerCase().includes(needle) ||
          project.name.toLowerCase().includes(needle),
      ),
    }))
    .filter((project) => !needle || project.repos.length > 0);

  return (
    <Page
      title="Git"
      icon="git"
      color={navColor("git")}
      actions={
        <>
          <label className="relative hidden h-9 items-center sm:flex">
            <span className="pointer-events-none absolute left-2.5 text-ui-fg-faint">
              <Icon name="search" className="size-4" />
            </span>
            <span className="sr-only">Search repositories</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 w-56 rounded-md border border-ui-border-strong bg-ui-field pr-2 pl-8 text-sm text-ui-fg outline-none focus:border-[var(--accent)]"
            />
          </label>
          <Link to="/git/tokens" className={`${buttonClass} inline-flex items-center gap-1.5`}>
            <Icon name="security" className="size-4" />
            <span className="hidden sm:inline">Tokens</span>
          </Link>
          <button
            type="button"
            onClick={() => setCreating({})}
            className={`${primaryButtonClass} inline-flex items-center gap-1.5`}
          >
            <Icon name="plus" className="size-4" />
            <span className="hidden sm:inline">New repository</span>
          </button>
        </>
      }
    >
      <Stack>
        {failed && (
          <Block>
            <p className="text-sm text-ui-danger">Git is not reachable right now.</p>
          </Block>
        )}

        {!failed && total === 0 && projects.length === 0 && (
          <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-ui-border p-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent)]">
                <Icon name="git" className="size-7" />
              </span>
              <p className="text-sm text-ui-fg-muted">No repositories yet.</p>
              <button type="button" onClick={() => setCreating({})} className={primaryButtonClass}>
                New repository
              </button>
            </div>
          </div>
        )}

        {shown.map((project) => (
          <section key={project.name} className="flex flex-col gap-2">
            <header className="flex items-center gap-2 px-1">
              <Icon name="folder" className="size-4 text-[var(--accent)]" />
              <h2 className="font-mono text-sm font-semibold text-ui-fg">{project.name}</h2>
              <span className="text-xs text-ui-fg-faint tabular-nums">{project.repos.length}</span>
              <button
                type="button"
                onClick={() => setCreating({ project: project.name })}
                aria-label={`New repository in ${project.name}`}
                title="New repository"
                className="ml-auto grid size-7 cursor-pointer place-items-center rounded-md text-ui-fg-muted outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
              >
                <Icon name="plus" className="size-4" />
              </button>
            </header>
            {project.repos.length === 0 ? (
              <p className="rounded-xl border border-dashed border-ui-border px-4 py-3 text-sm text-ui-fg-muted">
                No repositories in this project.
              </p>
            ) : (
              <ul className="overflow-hidden rounded-xl border border-ui-border bg-ui-raised">
                {project.repos.map((repo) => (
                  <li key={repo.name} className="border-b border-ui-border-soft/60 last:border-b-0">
                    <Link
                      to={repoHref(repo.project, repo.name)}
                      className="group flex items-center gap-4 px-4 py-3 outline-none transition-colors hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring focus-visible:ring-inset motion-reduce:transition-none"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent)]">
                        <Icon name="git" className="size-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-semibold text-ui-fg group-hover:text-[var(--accent-fg)]">
                            {repo.name}
                          </span>
                          <Badge tone={repo.private ? "neutral" : "accent"}>{repo.private ? "Private" : "Public"}</Badge>
                        </span>
                        {repo.description && (
                          <span className="mt-0.5 block truncate text-sm text-ui-fg-muted">{repo.description}</span>
                        )}
                      </span>
                      <span className="hidden shrink-0 text-xs text-ui-fg-muted sm:block">
                        Created <Ago date={repo.created_at} />
                      </span>
                      <Icon name="chevron" className="size-4 shrink-0 text-ui-fg-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {!failed && needle && shown.length === 0 && (
          <Block>
            <p className="text-sm text-ui-fg-muted">Nothing matches.</p>
          </Block>
        )}
      </Stack>

      <NewRepoDialog
        open={creating !== null}
        projects={projects}
        initialProject={creating?.project}
        onCreated={(repo) => {
          setCreating(null);
          navigate(repoHref(repo.project, repo.name));
        }}
        onClose={() => setCreating(null)}
      />
    </Page>
  );
}
