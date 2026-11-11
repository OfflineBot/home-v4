import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Icon } from "../icons";
import { commitHref, initials, repoHref, shortHash, type Ref, type RepoTab } from "../../lib/git";
import { formatDateTime, timeAgo } from "../../lib/format";
import { accentVars } from "../../lib/nav";

const avatarColors = ["mauve", "blue", "teal", "peach", "pink", "green", "sapphire", "flamingo"];

export function Avatar({ name, email = "", size = "md" }: { name: string; email?: string; size?: "sm" | "md" }) {
  let hash = 0;
  for (const char of email || name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (
    <span
      style={accentVars(avatarColors[hash % avatarColors.length])}
      title={email ? `${name} <${email}>` : name}
      className={`grid shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--accent)_22%,transparent)] font-semibold text-[var(--accent)] ${
        size === "sm" ? "size-5 text-[9px]" : "size-7 text-[11px]"
      }`}
    >
      {initials(name)}
    </span>
  );
}

export function Ago({ date }: { date: string }) {
  return (
    <time dateTime={date} title={formatDateTime(date)} suppressHydrationWarning>
      {timeAgo(date)}
    </time>
  );
}

export function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    void navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        copyText(text);
        setDone(true);
        window.setTimeout(() => setDone(false), 1200);
      }}
      aria-label={label}
      title={label}
      className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-ui-fg-faint outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
    >
      <Icon name={done ? "check" : "copy"} className={`size-3.5 ${done ? "text-ctp-green" : ""}`} />
    </button>
  );
}

export function HashLink({ project, repo, hash }: { project: string; repo: string; hash: string }) {
  return (
    <Link
      to={commitHref(project, repo, hash)}
      className="rounded-md border border-ui-border bg-ui-field px-1.5 py-0.5 font-mono text-xs text-ui-fg-muted outline-none hover:border-[var(--accent)] hover:text-[var(--accent-fg)] focus-visible:ring-2 focus-visible:ring-ui-ring"
    >
      {shortHash(hash)}
    </Link>
  );
}

export function RefSelect({
  project,
  repo,
  value,
  branches,
  tags,
  path,
  tab,
}: {
  project: string;
  repo: string;
  value: string;
  branches: Ref[];
  tags: Ref[];
  path: string;
  tab: RepoTab;
}) {
  const navigate = useNavigate();
  const known = branches.some((ref) => ref.name === value) || tags.some((ref) => ref.name === value);

  return (
    <label className="relative flex h-9 items-center">
      <span className="pointer-events-none absolute left-2.5 text-ui-fg-muted">
        <Icon name="branch" className="size-4" />
      </span>
      <span className="sr-only">Branch or tag</span>
      <select
        value={value}
        onChange={(event) =>
          navigate(repoHref(project, repo, { ref: event.target.value, tab, path: tab === "code" ? path : undefined }))
        }
        className="h-9 max-w-56 cursor-pointer truncate rounded-md border border-ui-border-strong bg-ui-field pr-2 pl-8 font-mono text-sm text-ui-fg outline-none focus:border-[var(--accent)]"
      >
        {!known && <option value={value}>{shortHash(value)}</option>}
        {branches.length > 0 && (
          <optgroup label="Branches">
            {branches.map((ref) => (
              <option key={`b-${ref.name}`} value={ref.name}>
                {ref.name}
              </option>
            ))}
          </optgroup>
        )}
        {tags.length > 0 && (
          <optgroup label="Tags">
            {tags.map((ref) => (
              <option key={`t-${ref.name}`} value={ref.name}>
                {ref.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}

export function RepoTabs({
  project,
  repo,
  active,
  refName,
  owned,
  branchCount,
}: {
  project: string;
  repo: string;
  active: RepoTab;
  refName: string;
  owned: boolean;
  branchCount: number;
}) {
  const tabs: { tab: RepoTab; label: string; icon: string; count?: number }[] = [
    { tab: "code", label: "Code", icon: "code" },
    { tab: "commits", label: "Commits", icon: "commit" },
    { tab: "branches", label: "Branches", icon: "branch", count: branchCount },
    ...(owned ? [{ tab: "settings" as const, label: "Settings", icon: "settings" }] : []),
  ];

  return (
    <nav aria-label="Repository" className="flex items-end gap-1 overflow-x-auto border-b border-ui-border-soft">
      {tabs.map((entry) => (
        <Link
          key={entry.tab}
          to={repoHref(project, repo, { tab: entry.tab, ref: entry.tab === "code" || entry.tab === "commits" ? refName : undefined })}
          aria-current={active === entry.tab ? "page" : undefined}
          className={`-mb-px flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none ${
            active === entry.tab
              ? "border-[var(--accent)] font-medium text-ui-fg"
              : "border-transparent text-ui-fg-muted hover:text-ui-fg"
          }`}
        >
          <Icon name={entry.icon} className="size-4" />
          {entry.label}
          {entry.count !== undefined && (
            <span className="rounded-full bg-ui-field px-1.5 text-xs text-ui-fg-muted tabular-nums">{entry.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

function cloneOrigin() {
  return window.location.origin;
}

export function CloneBox({ clonePath, empty }: { clonePath: string; empty: boolean }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(cloneOrigin()), []);
  const url = `${origin}${clonePath}`;
  const commands = empty
    ? [`git remote add origin ${url}`, "git push -u origin main"]
    : [`git clone ${url}`];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-1 rounded-lg border border-ui-border bg-ui-field pl-3">
        <Icon name="git" className="size-4 shrink-0 text-ui-fg-faint" />
        <input
          readOnly
          value={url}
          aria-label="Clone URL"
          onFocus={(event) => event.currentTarget.select()}
          className="h-9 min-w-0 flex-1 bg-transparent px-2 font-mono text-sm text-ui-fg outline-none"
        />
        <CopyButton text={url} label="Copy clone URL" />
      </div>
      <div className="overflow-hidden rounded-lg border border-ui-border-soft bg-ctp-mantle">
        {[...commands, "git config --global credential.helper store"].map((command) => (
          <div key={command} className="flex items-center gap-2 border-b border-ui-border-soft/60 pl-3 last:border-b-0">
            <span className="text-ui-fg-faint select-none">$</span>
            <code className="min-w-0 flex-1 truncate py-1.5 font-mono text-xs text-ui-fg">{command}</code>
            <CopyButton text={command} label="Copy command" />
          </div>
        ))}
      </div>
      <p className="text-xs text-ui-fg-muted">
        Sign in with your username and a{" "}
        <Link to="/git/tokens" className="text-[var(--accent-fg)] hover:underline">
          Git token
        </Link>
        .
      </p>
    </div>
  );
}
