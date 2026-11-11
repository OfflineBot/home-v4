export type Repo = {
  project: string;
  name: string;
  description: string;
  private: boolean;
  created_at: string;
  clone_path: string;
};

export type Project = {
  name: string;
  created_at: string;
  repos: Repo[];
};

export type Ref = {
  name: string;
  commit: string;
  updated: string;
};

export type RepoDetail = Repo & {
  owned: boolean;
  empty: boolean;
  default_branch: string;
  branches: Ref[];
  tags: Ref[];
  commits: { hash: string; author: string; date: string; subject: string }[];
};

export type CommitSummary = {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  date: string;
  subject: string;
  body: string;
};

export type CommitPage = {
  ref: string;
  commits: CommitSummary[];
  next_page: number | null;
};

export type TreeEntry = {
  name: string;
  path: string;
  type: "tree" | "blob" | "commit";
  mode: string;
  size: number | null;
  last_commit?: { hash: string; subject: string; author: string; date: string } | null;
};

export type TreeListing = {
  ref: string;
  commit: string;
  path: string;
  entries: TreeEntry[];
};

export type FileChange = {
  path: string;
  old_path?: string;
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "type_changed";
  additions: number;
  deletions: number;
  binary: boolean;
  patch: string;
  truncated: boolean;
};

export type CommitDetail = CommitSummary & {
  additions: number;
  deletions: number;
  files: FileChange[];
  files_truncated: boolean;
};

export type Branch = {
  name: string;
  commit: string;
  updated: string;
  subject: string;
  default: boolean;
  ahead: number | null;
  behind: number | null;
};

export type GitToken = {
  id: number;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
};

export type RepoTab = "code" | "commits" | "branches" | "settings";

export const namePattern = "[A-Za-z0-9][A-Za-z0-9._\\-]{0,63}";
export const maxDescription = 300;

export function nameError(raw: string) {
  const name = raw.trim();
  if (name === "") return "Enter a name.";
  if (!new RegExp(`^${namePattern}$`).test(name)) return "Use letters, digits, . _ - (max. 64).";
  if (/\.git$/i.test(name)) return "Names cannot end with .git.";
  if (name.includes("..")) return "Names cannot contain ..";
  return null;
}

export function shortHash(hash: string) {
  return hash.slice(0, 7);
}

function encode(value: string) {
  return encodeURIComponent(value);
}

export function repoHref(
  project: string,
  repo: string,
  options: { ref?: string; path?: string; tab?: RepoTab } = {},
) {
  const params = new URLSearchParams();
  if (options.tab && options.tab !== "code") params.set("tab", options.tab);
  if (options.ref) params.set("ref", options.ref);
  if (options.path) params.set("path", options.path.replace(/^\/+/, ""));
  const query = params.toString();
  return `/git/${encode(project)}/${encode(repo)}${query ? `?${query}` : ""}`;
}

export function commitHref(project: string, repo: string, hash: string) {
  return `/git/${encode(project)}/${encode(repo)}/commit/${encode(hash)}`;
}

export function blobHref(project: string, repo: string, ref: string, path: string) {
  return `/git/api?${new URLSearchParams({ op: "blob", project, name: repo, ref, path })}`;
}

export function isReadme(name: string) {
  return /^readme(\.(md|markdown|txt|rst))?$/i.test(name);
}

export function initials(name: string) {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}

const errorMessages: Record<string, string> = {
  invalid_name: "This name is not allowed.",
  reserved: "This name is reserved.",
  name_taken: "This project name is already taken.",
  taken: "This project name is already taken.",
  invalid: "This name is not allowed.",
  exists: "A repository with this name already exists.",
  not_owner: "Only the owner can change this.",
  not_found: "Not found.",
  ref_not_found: "This branch or commit does not exist.",
  not_a_folder: "This is not a folder.",
  not_a_file: "This is not a file.",
  too_many_tokens: "You already have the maximum of 20 tokens.",
  invalid_description: "The description is too long or has line breaks.",
  unreachable: "Backend not reachable",
};

export function gitError(code: string | undefined, status: number) {
  return (code && errorMessages[code]) || `Failed (${status})`;
}

export class GitError extends Error {
  constructor(
    readonly code: string | undefined,
    status: number,
  ) {
    super(gitError(code, status));
  }
}

const endpoint = "/git/api";

async function post<T>(body: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new GitError("unreachable", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GitError(data?.error, res.status);
  return data as T;
}

export const gitApi = {
  async checkProject(name: string) {
    const res = await fetch(`${endpoint}?${new URLSearchParams({ op: "check", name })}`);
    if (!res.ok) return null;
    return (await res.json()) as { name: string; available: boolean; reason?: string };
  },
  createProject: (name: string) => post<Project>({ op: "project-new", name }),
  createRepo: (input: { project: string; name: string; description: string; private: boolean }) =>
    post<Repo>({ op: "repo-new", ...input }),
  updateRepo: (input: { project: string; name: string; private?: boolean; description?: string }) =>
    post<Repo>({ op: "repo-update", ...input }),
  deleteRepo: (project: string, name: string) => post({ op: "repo-delete", project, name }),
  deleteProject: (name: string) => post({ op: "project-delete", name }),
  createToken: (name: string) => post<GitToken & { token: string }>({ op: "token-new", name }),
  deleteToken: (id: number) => post({ op: "token-delete", id }),
};
