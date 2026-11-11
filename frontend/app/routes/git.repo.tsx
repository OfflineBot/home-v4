import { useEffect, useState } from "react";
import { Link, useNavigate, useRevalidator } from "react-router";
import type { Route } from "./+types/git.repo";
import { Badge, Block, Stack } from "../components/block";
import { EntryIcon } from "../components/files/entry-icon";
import { Ago, Avatar, CloneBox, CopyButton, HashLink, RefSelect, RepoTabs } from "../components/git/parts";
import { Icon } from "../components/icons";
import { Page } from "../components/page";
import { FilePreview } from "../components/preview/file-preview";
import { Markdown } from "../components/preview/markdown";
import { Field, buttonClass, dangerButtonClass, inputClass, primaryButtonClass, textareaClass } from "../components/setting-row";
import { Toast } from "../components/toast";
import { formatBytes, formatDate } from "../lib/format";
import {
  blobHref,
  commitHref,
  gitApi,
  gitError,
  isReadme,
  maxDescription,
  repoHref,
  type Branch,
  type CommitPage,
  type RepoDetail,
  type RepoTab,
  type TreeListing,
} from "../lib/git";
import { readBranches, readCommits, readText, readTree, repoDetail } from "../lib/git.server";
import { navColor } from "../lib/nav";
import { requireToken } from "../lib/session";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.repo.project}/${loaderData.repo.name} · Git` : "Git" }];
}

function tabOf(value: string | null, owned: boolean): RepoTab {
  if (value === "commits" || value === "branches") return value;
  if (value === "settings" && owned) return value;
  return "code";
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const detail = await repoDetail(token, params.project, params.repo);
  if (!detail.ok) {
    throw new Response(gitError(detail.error, detail.status), { status: detail.status === 404 ? 404 : 502 });
  }

  const repo = detail.data;
  repo.branches ??= [];
  repo.tags ??= [];
  repo.commits ??= [];

  const url = new URL(request.url);
  const tab = tabOf(url.searchParams.get("tab"), repo.owned);
  const ref = url.searchParams.get("ref") || repo.default_branch;
  const path = (url.searchParams.get("path") ?? "").replace(/^\/+|\/+$/g, "");
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);

  let tree: TreeListing | null = null;
  let file: string | null = null;
  let readme: { name: string; text: string } | null = null;
  let commits: CommitPage | null = null;
  let branches: Branch[] | null = null;
  let problem: string | null = null;

  if (!repo.empty && tab === "code") {
    const result = await readTree(token, repo.project, repo.name, ref, path);
    if (result.ok) {
      tree = result.data;
      const entry = tree.entries.find((item) => item.type === "blob" && isReadme(item.name));
      if (entry) {
        const text = await readText(token, repo.project, repo.name, ref, entry.path);
        if (text !== null) readme = { name: entry.name, text };
      }
    } else if (result.error === "not_a_folder") {
      file = path;
    } else {
      problem = gitError(result.error, result.status);
    }
  }

  if (!repo.empty && tab === "commits") {
    const result = await readCommits(token, repo.project, repo.name, ref, page);
    if (result.ok) commits = result.data;
    else problem = gitError(result.error, result.status);
  }

  if (tab === "branches") {
    const result = await readBranches(token, repo.project, repo.name);
    if (result.ok) branches = result.data.branches ?? [];
    else problem = gitError(result.error, result.status);
  }

  return { repo, tab, ref, path, page, tree, file, readme, commits, branches, problem };
}

export default function RepoPage({ loaderData }: Route.ComponentProps) {
  const { repo, tab, ref, path, page, tree, file, readme, commits, branches, problem } = loaderData;

  return (
    <Page
      title={repo.name}
      icon="git"
      color={navColor("git")}
      back={{ to: "/git", label: "Git" }}
      actions={
        <>
          <span className="hidden font-mono text-sm text-ui-fg-muted sm:inline">{repo.project}</span>
          <Badge tone={repo.private ? "neutral" : "accent"}>{repo.private ? "Private" : "Public"}</Badge>
          {!repo.empty && (tab === "code" || tab === "commits") && (
            <RefSelect
              project={repo.project}
              repo={repo.name}
              value={ref}
              branches={repo.branches}
              tags={repo.tags}
              path={path}
              tab={tab}
            />
          )}
        </>
      }
    >
      <Stack>
        <RepoTabs
          project={repo.project}
          repo={repo.name}
          active={tab}
          refName={ref}
          owned={repo.owned}
          branchCount={repo.branches.length}
        />

        {problem && (
          <Block>
            <p className="text-sm text-ui-danger">{problem}</p>
          </Block>
        )}

        {tab === "code" &&
          (repo.empty ? (
            <EmptyRepo repo={repo} />
          ) : (
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="flex min-w-0 flex-col gap-4">
                <PathBar repo={repo} refName={ref} path={path} />
                {tree && (
                  <div className="overflow-hidden rounded-xl border border-ui-border bg-ui-raised">
                    <HeadCommit repo={repo} refName={ref} />
                    <TreeTable repo={repo} refName={ref} tree={tree} />
                  </div>
                )}
                {file !== null && <FilePanel repo={repo} refName={ref} path={file} />}
                {readme && (
                  <section className="overflow-hidden rounded-xl border border-ui-border bg-ui-raised">
                    <header className="flex h-10 items-center gap-2 border-b border-ui-border-soft bg-ui-surface px-4 text-sm font-semibold text-ui-fg">
                      <Icon name="pages" className="size-4 text-[var(--accent)]" />
                      {readme.name}
                    </header>
                    <div className="p-5">
                      {/\.(md|markdown)$/i.test(readme.name) ? (
                        <Markdown source={readme.text} resolve={resolver(repo, ref, path)} />
                      ) : (
                        <pre className="font-mono text-sm whitespace-pre-wrap text-ui-fg">{readme.text}</pre>
                      )}
                    </div>
                  </section>
                )}
              </div>
              {path === "" && <AboutPanel repo={repo} />}
            </div>
          ))}

        {tab === "commits" && (repo.empty ? <EmptyRepo repo={repo} /> : commits && <CommitList repo={repo} page={commits} current={page} refName={ref} />)}
        {tab === "branches" && branches && <BranchList repo={repo} branches={branches} />}
        {tab === "settings" && repo.owned && <SettingsPanel repo={repo} />}
      </Stack>
    </Page>
  );
}

function resolver(repo: RepoDetail, ref: string, base: string) {
  return (target: string) => {
    if (target.startsWith("#")) return null;
    const parts = base ? base.split("/") : [];
    for (const part of target.split(/[?#]/)[0].split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") parts.pop();
      else parts.push(part);
    }
    return repoHref(repo.project, repo.name, { ref, path: parts.join("/") });
  };
}

function EmptyRepo({ repo }: { repo: RepoDetail }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-ui-border bg-ui-raised p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent)]">
          <Icon name="upload" className="size-5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-ui-fg">This repository is empty</h2>
          <p className="text-sm text-ui-fg-muted">Push an existing project to get started.</p>
        </div>
      </div>
      <CloneBox clonePath={repo.clone_path} empty />
    </section>
  );
}

function AboutPanel({ repo }: { repo: RepoDetail }) {
  return (
    <aside className="flex flex-col gap-4 rounded-xl border border-ui-border bg-ui-raised p-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-medium tracking-wide text-ui-fg-faint uppercase">About</h2>
        <p className={`text-sm ${repo.description ? "text-ui-fg" : "text-ui-fg-faint"}`}>
          {repo.description || "No description"}
        </p>
        <ul className="flex flex-col gap-1.5 text-sm text-ui-fg-muted">
          <li className="flex items-center gap-2">
            <Icon name="branch" className="size-4" />
            <span className="font-mono text-ui-fg">{repo.default_branch}</span>
            <span>· {repo.branches.length} {repo.branches.length === 1 ? "branch" : "branches"}</span>
          </li>
          {repo.tags.length > 0 && (
            <li className="flex items-center gap-2">
              <Icon name="commit" className="size-4" />
              {repo.tags.length} {repo.tags.length === 1 ? "tag" : "tags"}
            </li>
          )}
          <li className="flex items-center gap-2">
            <Icon name="calendar" className="size-4" />
            Created {formatDate(repo.created_at)}
          </li>
        </ul>
      </div>
      <div className="flex flex-col gap-2 border-t border-ui-border-soft pt-4">
        <h2 className="text-xs font-medium tracking-wide text-ui-fg-faint uppercase">Clone</h2>
        <CloneBox clonePath={repo.clone_path} empty={false} />
      </div>
    </aside>
  );
}

function PathBar({ repo, refName, path }: { repo: RepoDetail; refName: string; path: string }) {
  const parts = path ? path.split("/") : [];
  return (
    <nav aria-label="Path" className="flex min-w-0 flex-wrap items-center gap-1 font-mono text-sm">
      <Link
        to={repoHref(repo.project, repo.name, { ref: refName })}
        className={`rounded px-1 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ui-ring ${
          parts.length === 0 ? "font-semibold text-ui-fg" : "text-[var(--accent-fg)]"
        }`}
      >
        {repo.name}
      </Link>
      {parts.map((part, index) => (
        <span key={index} className="flex min-w-0 items-center gap-1">
          <span className="text-ui-fg-faint">/</span>
          {index === parts.length - 1 ? (
            <span className="truncate font-semibold text-ui-fg">{part}</span>
          ) : (
            <Link
              to={repoHref(repo.project, repo.name, { ref: refName, path: parts.slice(0, index + 1).join("/") })}
              className="truncate rounded px-1 text-[var(--accent-fg)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ui-ring"
            >
              {part}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

function HeadCommit({ repo, refName }: { repo: RepoDetail; refName: string }) {
  const head = refName === repo.default_branch ? repo.commits[0] : null;
  if (!head) return null;
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-ui-border-soft bg-ui-surface px-4 py-2.5">
      <Avatar name={head.author} />
      <span className="shrink-0 text-sm font-medium text-ui-fg">{head.author}</span>
      <Link
        to={commitHref(repo.project, repo.name, head.hash)}
        className="min-w-0 flex-1 truncate text-sm text-ui-fg-muted outline-none hover:text-[var(--accent-fg)] hover:underline focus-visible:ring-2 focus-visible:ring-ui-ring"
      >
        {head.subject}
      </Link>
      <span className="hidden shrink-0 items-center gap-2 text-xs text-ui-fg-muted sm:flex">
        <HashLink project={repo.project} repo={repo.name} hash={head.hash} />
        <Ago date={head.date} />
      </span>
    </div>
  );
}

function TreeTable({ repo, refName, tree }: { repo: RepoDetail; refName: string; tree: TreeListing }) {
  const parent = tree.path ? tree.path.split("/").slice(0, -1).join("/") : null;

  return (
    <ul className="flex flex-col">
      {parent !== null && (
        <li className="border-b border-ui-border-soft/60">
          <Link
            to={repoHref(repo.project, repo.name, { ref: refName, path: parent })}
            className="flex h-11 items-center gap-3 px-4 text-sm text-ui-fg-muted outline-none hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring focus-visible:ring-inset"
          >
            <span className="grid size-8 place-items-center">
              <Icon name="chevron" className="size-4 -rotate-90" />
            </span>
            ..
          </Link>
        </li>
      )}
      {tree.entries.length === 0 && <li className="px-4 py-3 text-sm text-ui-fg-muted">This folder is empty.</li>}
      {tree.entries.map((entry) => (
        <li key={entry.path} className="border-b border-ui-border-soft/60 last:border-b-0">
          <div className="flex h-11 items-center gap-3 px-4 hover:bg-ui-hover">
            {entry.type === "commit" ? (
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ui-field text-ui-fg-muted">
                <Icon name="git" className="size-4" />
              </span>
            ) : (
              <EntryIcon entry={{ name: entry.name, type: entry.type === "tree" ? "dir" : "file" }} />
            )}
            {entry.type === "commit" ? (
              <span className="min-w-0 shrink-0 truncate text-sm text-ui-fg-muted sm:w-64" title="Submodule">
                {entry.name}
              </span>
            ) : (
              <Link
                to={repoHref(repo.project, repo.name, { ref: refName, path: entry.path })}
                className="min-w-0 shrink-0 truncate text-sm text-ui-fg outline-none hover:text-[var(--accent-fg)] hover:underline focus-visible:ring-2 focus-visible:ring-ui-ring sm:w-64"
              >
                {entry.name}
              </Link>
            )}
            {entry.last_commit ? (
              <Link
                to={commitHref(repo.project, repo.name, entry.last_commit.hash)}
                className="hidden min-w-0 flex-1 truncate text-sm text-ui-fg-muted outline-none hover:text-[var(--accent-fg)] hover:underline focus-visible:ring-2 focus-visible:ring-ui-ring md:block"
              >
                {entry.last_commit.subject}
              </Link>
            ) : (
              <span className="hidden flex-1 md:block" />
            )}
            <span className="ml-auto shrink-0 text-xs text-ui-fg-muted tabular-nums">
              {entry.last_commit ? <Ago date={entry.last_commit.date} /> : entry.size !== null ? formatBytes(entry.size) : ""}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function FilePanel({ repo, refName, path }: { repo: RepoDetail; refName: string; path: string }) {
  const name = path.split("/").pop() ?? path;
  const href = blobHref(repo.project, repo.name, refName, path);

  return (
    <section className="overflow-hidden rounded-xl border border-ui-border bg-ui-raised">
      <header className="flex flex-wrap items-center gap-2 border-b border-ui-border-soft bg-ui-surface px-4 py-2">
        <EntryIcon entry={{ name, type: "file" }} />
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-ui-fg">{name}</span>
        <Link
          to={`${repoHref(repo.project, repo.name, { tab: "commits", ref: refName })}&path=${encodeURIComponent(path)}`}
          className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-ui-fg-muted outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
        >
          <Icon name="commit" className="size-3.5" />
          History
        </Link>
        <a
          href={href}
          download={name}
          aria-label="Download"
          title="Download"
          className="grid size-8 place-items-center rounded-md text-ui-fg-muted outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
        >
          <Icon name="download" className="size-4" />
        </a>
      </header>
      <div className="p-3">
        <FilePreview key={href} source={{ name, url: href }} />
      </div>
    </section>
  );
}

function CommitList({
  repo,
  page,
  current,
  refName,
}: {
  repo: RepoDetail;
  page: CommitPage;
  current: number;
  refName: string;
}) {
  const groups: { day: string; commits: CommitPage["commits"] }[] = [];
  for (const commit of page.commits) {
    const day = formatDate(commit.date);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.commits.push(commit);
    else groups.push({ day, commits: [commit] });
  }
  const pageHref = (target: number) =>
    `${repoHref(repo.project, repo.name, { tab: "commits", ref: refName })}${target > 1 ? `&page=${target}` : ""}`;

  return (
    <div className="flex flex-col gap-5">
      {page.commits.length === 0 && (
        <Block>
          <p className="text-sm text-ui-fg-muted">No commits.</p>
        </Block>
      )}
      {groups.map((group) => (
        <section key={group.day} className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-xs font-medium tracking-wide text-ui-fg-faint uppercase">
            <Icon name="commit" className="size-3.5" />
            {group.day}
          </h3>
          <ul className="overflow-hidden rounded-xl border border-ui-border bg-ui-raised">
            {group.commits.map((commit) => (
              <li key={commit.hash} className="flex items-center gap-3 border-b border-ui-border-soft/60 px-4 py-3 last:border-b-0 hover:bg-ui-hover">
                <div className="min-w-0 flex-1">
                  <Link
                    to={commitHref(repo.project, repo.name, commit.hash)}
                    className="block truncate text-sm font-medium text-ui-fg outline-none hover:text-[var(--accent-fg)] hover:underline focus-visible:ring-2 focus-visible:ring-ui-ring"
                  >
                    {commit.subject}
                  </Link>
                  <span className="mt-1 flex items-center gap-2 text-xs text-ui-fg-muted">
                    <Avatar name={commit.author} email={commit.email} size="sm" />
                    <span className="text-ui-fg">{commit.author}</span>
                    <span>
                      committed <Ago date={commit.date} />
                    </span>
                    {commit.parents.length > 1 && <Badge>Merge</Badge>}
                  </span>
                </div>
                <HashLink project={repo.project} repo={repo.name} hash={commit.hash} />
                <CopyButton text={commit.hash} label="Copy commit hash" />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {(current > 1 || page.next_page) && (
        <nav aria-label="Pages" className="flex justify-center gap-2">
          {current > 1 && (
            <Link to={pageHref(current - 1)} className={`${buttonClass} inline-flex items-center gap-1.5`}>
              <Icon name="chevron" className="size-4 rotate-180" />
              Newer
            </Link>
          )}
          {page.next_page && (
            <Link to={pageHref(page.next_page)} className={`${buttonClass} inline-flex items-center gap-1.5`}>
              Older
              <Icon name="chevron" className="size-4" />
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

function BranchList({ repo, branches }: { repo: RepoDetail; branches: Branch[] }) {
  const widest = Math.max(1, ...branches.map((branch) => Math.max(branch.ahead ?? 0, branch.behind ?? 0)));

  return (
    <div className="flex flex-col gap-5">
      <ul className="overflow-hidden rounded-xl border border-ui-border bg-ui-raised">
        {branches.length === 0 && <li className="px-4 py-3 text-sm text-ui-fg-muted">No branches yet.</li>}
        {branches.map((branch) => (
          <li key={branch.name} className="flex flex-wrap items-center gap-3 border-b border-ui-border-soft/60 px-4 py-3 last:border-b-0 hover:bg-ui-hover sm:flex-nowrap">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent)]">
              <Icon name="branch" className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <Link
                  to={repoHref(repo.project, repo.name, { ref: branch.name })}
                  className="truncate font-mono text-sm text-ui-fg outline-none hover:text-[var(--accent-fg)] hover:underline focus-visible:ring-2 focus-visible:ring-ui-ring"
                >
                  {branch.name}
                </Link>
                {branch.default && <Badge tone="accent">Default</Badge>}
              </span>
              <span className="mt-1 flex min-w-0 items-center gap-2 text-xs text-ui-fg-muted">
                <Link to={commitHref(repo.project, repo.name, branch.commit)} className="truncate hover:text-ui-fg hover:underline">
                  {branch.subject}
                </Link>
                <span className="shrink-0">
                  · <Ago date={branch.updated} />
                </span>
              </span>
            </div>
            {!branch.default && branch.ahead !== null && branch.behind !== null && (
              <span
                className="flex shrink-0 items-center gap-2 text-xs text-ui-fg-muted tabular-nums"
                title={`${branch.behind} behind, ${branch.ahead} ahead of ${repo.default_branch}`}
              >
                <span className="w-6 text-right">{branch.behind}</span>
                <span className="flex h-1.5 w-28 items-center">
                  <span className="flex h-full w-1/2 justify-end">
                    <span className="h-full rounded-l-full bg-ui-fg-faint" style={{ width: `${(branch.behind / widest) * 100}%` }} />
                  </span>
                  <span className="h-3 w-px bg-ui-border-strong" />
                  <span className="flex h-full w-1/2">
                    <span className="h-full rounded-r-full bg-[var(--accent)]" style={{ width: `${(branch.ahead / widest) * 100}%` }} />
                  </span>
                </span>
                <span className="w-6">{branch.ahead}</span>
              </span>
            )}
          </li>
        ))}
      </ul>

      {repo.tags.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-ui-fg-faint uppercase">Tags</h3>
          <ul className="flex flex-wrap gap-2">
            {repo.tags.map((tag) => (
              <li key={tag.name}>
                <Link
                  to={repoHref(repo.project, repo.name, { ref: tag.name })}
                  className="flex h-8 items-center gap-2 rounded-full border border-ui-border bg-ui-raised px-3 font-mono text-xs text-ui-fg outline-none hover:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-ui-ring"
                >
                  {tag.name}
                  <span className="text-ui-fg-faint">
                    <Ago date={tag.updated} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SettingsPanel({ repo }: { repo: RepoDetail }) {
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [description, setDescription] = useState(repo.description);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState({ message: "", attempt: 0 });

  useEffect(() => setDescription(repo.description), [repo.description]);

  async function run(key: string, task: () => Promise<unknown>) {
    setBusy(key);
    try {
      await task();
      void revalidator.revalidate();
    } catch (error) {
      setFailure((current) => ({
        message: error instanceof Error ? error.message : "Failed.",
        attempt: current.attempt + 1,
      }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Stack>
      <Block title="Visibility">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ui-fg">
            {repo.private ? "Only you can see and clone this repository." : "Anyone can clone this repository."}
          </p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("visibility", () => gitApi.updateRepo({ project: repo.project, name: repo.name, private: !repo.private }))}
            className={buttonClass}
          >
            {busy === "visibility" ? "Saving…" : repo.private ? "Make public" : "Make private"}
          </button>
        </div>
      </Block>

      <Block title="Description">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run("description", () => gitApi.updateRepo({ project: repo.project, name: repo.name, description }));
          }}
          className="flex flex-col gap-3"
        >
          <Field label="Description">
            <textarea
              value={description}
              maxLength={maxDescription}
              rows={2}
              onChange={(event) => setDescription(event.target.value.replace(/[\r\n]+/g, " "))}
              className={textareaClass}
            />
          </Field>
          <button
            type="submit"
            disabled={busy !== null || description === repo.description}
            className={`${primaryButtonClass} w-fit`}
          >
            {busy === "description" ? "Saving…" : "Save"}
          </button>
        </form>
      </Block>

      <Block title="Delete repository">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (confirm !== repo.name) return;
            void run("delete", async () => {
              await gitApi.deleteRepo(repo.project, repo.name);
              navigate("/git");
            });
          }}
          className="flex flex-col gap-3"
        >
          <p className="text-sm text-ui-fg-muted">
            Type <code className="rounded bg-ui-field px-1.5 py-0.5 font-mono text-ui-fg">{repo.name}</code> to confirm.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              aria-label="Repository name"
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} max-w-xs font-mono`}
            />
            <button type="submit" disabled={busy !== null || confirm !== repo.name} className={dangerButtonClass}>
              {busy === "delete" ? "Deleting…" : "Delete repository"}
            </button>
          </div>
        </form>
      </Block>
      <Toast key={failure.attempt} message={failure.attempt > 0 ? failure.message : null} />
    </Stack>
  );
}
