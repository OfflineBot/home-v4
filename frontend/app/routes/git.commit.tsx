import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/git.commit";
import { Badge, Block, Stack } from "../components/block";
import { ChangeStat, DiffView } from "../components/git/code";
import { Avatar, CopyButton, HashLink } from "../components/git/parts";
import { Icon } from "../components/icons";
import { Page } from "../components/page";
import { formatDateTime } from "../lib/format";
import { gitError, repoHref, shortHash, type FileChange } from "../lib/git";
import { readCommit } from "../lib/git.server";
import { navColor } from "../lib/nav";
import { requireToken } from "../lib/session";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.commit.subject} · ${loaderData.repo}` : "Commit" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const result = await readCommit(token, params.project, params.repo, params.hash);
  if (!result.ok) {
    throw new Response(gitError(result.error, result.status), { status: result.status === 404 ? 404 : 502 });
  }
  const commit = result.data;
  commit.files ??= [];
  commit.parents ??= [];
  return { project: params.project, repo: params.repo, commit };
}

const statusTone: Record<FileChange["status"], { label: string; className: string }> = {
  added: { label: "Added", className: "border-ctp-green/40 text-ctp-green" },
  modified: { label: "Modified", className: "border-ctp-yellow/40 text-ctp-yellow" },
  deleted: { label: "Deleted", className: "border-ctp-red/40 text-ctp-red" },
  renamed: { label: "Renamed", className: "border-ctp-blue/40 text-ctp-blue" },
  copied: { label: "Copied", className: "border-ctp-sky/40 text-ctp-sky" },
  type_changed: { label: "Type changed", className: "border-ctp-mauve/40 text-ctp-mauve" },
};

export default function CommitPage({ loaderData }: Route.ComponentProps) {
  const { project, repo, commit } = loaderData;

  return (
    <Page
      title={commit.subject}
      icon="commit"
      color={navColor("git")}
      back={{ to: repoHref(project, repo, { tab: "commits" }), label: repo }}
    >
      <Stack>
        <section className="overflow-hidden rounded-xl border border-ui-border bg-ui-raised">
          <div className="flex flex-col gap-3 p-4">
            <h2 className="text-lg font-semibold text-ui-fg">{commit.subject}</h2>
            {commit.body.trim() && <p className="font-mono text-sm whitespace-pre-wrap text-ui-fg-muted">{commit.body.trim()}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ui-border-soft bg-ui-surface px-4 py-3 text-sm">
            <span className="flex items-center gap-2">
              <Avatar name={commit.author} email={commit.email} />
              <span className="font-medium text-ui-fg">{commit.author}</span>
              <span className="text-ui-fg-muted">committed {formatDateTime(commit.date)}</span>
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-2 text-xs text-ui-fg-muted">
              {commit.parents.length > 0 && (
                <span className="flex items-center gap-1.5">
                  {commit.parents.length === 1 ? "Parent" : "Parents"}
                  {commit.parents.map((parent) => (
                    <HashLink key={parent} project={project} repo={repo} hash={parent} />
                  ))}
                </span>
              )}
              <span className="flex items-center gap-1">
                <span className="font-mono text-ui-fg">{shortHash(commit.hash)}</span>
                <CopyButton text={commit.hash} label="Copy commit hash" />
              </span>
              <Link
                to={repoHref(project, repo, { ref: commit.hash })}
                className="flex h-7 items-center gap-1.5 rounded-md px-2 text-ui-fg-muted outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
              >
                <Icon name="code" className="size-3.5" />
                Browse files
              </Link>
            </span>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3 text-sm text-ui-fg-muted">
          <span>
            {commit.files.length} {commit.files.length === 1 ? "file" : "files"} changed
            {commit.files_truncated && " (list shortened)"}
          </span>
          <ChangeStat additions={commit.additions} deletions={commit.deletions} />
          {commit.parents.length > 1 && <Badge>Compared with the first parent</Badge>}
        </div>

        {commit.files.length === 0 && (
          <Block>
            <p className="text-sm text-ui-fg-muted">No file changes.</p>
          </Block>
        )}

        {commit.files.map((change) => (
          <FileDiff key={`${change.old_path ?? ""}:${change.path}`} project={project} repo={repo} hash={commit.hash} change={change} />
        ))}
      </Stack>
    </Page>
  );
}

function FileDiff({
  project,
  repo,
  hash,
  change,
}: {
  project: string;
  repo: string;
  hash: string;
  change: FileChange;
}) {
  const large = change.additions + change.deletions > 400;
  const [open, setOpen] = useState(!large);
  const tone = statusTone[change.status] ?? statusTone.modified;

  return (
    <section className="overflow-hidden rounded-xl border border-ui-border bg-ui-raised">
      <header className="flex flex-wrap items-center gap-3 border-b border-ui-border-soft bg-ui-surface px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? `Collapse ${change.path}` : `Expand ${change.path}`}
          className="grid size-7 cursor-pointer place-items-center rounded-md text-ui-fg-muted outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
        >
          <Icon name="chevron" className={`size-4 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
        </button>
        <span className={`rounded-md border px-1.5 text-[11px] font-medium ${tone.className}`}>{tone.label}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-ui-fg">
          {change.old_path && change.old_path !== change.path ? `${change.old_path} → ${change.path}` : change.path}
        </span>
        <ChangeStat additions={change.additions} deletions={change.deletions} />
        {change.status !== "deleted" && (
          <Link
            to={repoHref(project, repo, { ref: hash, path: change.path })}
            className="rounded-md px-2 py-1 text-xs text-ui-fg-muted outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
          >
            View file
          </Link>
        )}
      </header>
      {open &&
        (change.binary ? (
          <p className="px-4 py-3 text-sm text-ui-fg-muted">Binary file.</p>
        ) : change.patch.trim() === "" ? (
          <p className="px-4 py-3 text-sm text-ui-fg-muted">
            {change.status === "renamed" ? "Renamed without changes." : "No content changes."}
          </p>
        ) : (
          <>
            <DiffView change={change} />
            {change.truncated && (
              <p className="border-t border-ui-border-soft px-4 py-2 text-xs text-ui-fg-muted">This diff is shortened.</p>
            )}
          </>
        ))}
    </section>
  );
}
