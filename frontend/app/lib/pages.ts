export type PageSource = "git" | "files";

export type SitePage = {
  name: string;
  title: string;
  source: PageSource;
  project?: string;
  repo?: string;
  ref: string;
  folder: string;
  spa: boolean;
  enabled: boolean;
  status: "ok" | "disabled" | "source_missing";
  path: string;
  url?: string;
  created_at: string;
  updated_at: string;
};

export type PageInput = {
  name: string;
  title: string;
  source: PageSource;
  project: string;
  repo: string;
  ref: string;
  folder: string;
  spa: boolean;
};

export const pageNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function pageNameError(raw: string) {
  const name = raw.trim();
  if (name === "") return "Enter a name.";
  if (!pageNamePattern.test(name)) return "Use letters, digits, . _ - (max. 64).";
  return null;
}

const errorMessages: Record<string, string> = {
  invalid_name: "This name is not allowed.",
  invalid: "This name is not allowed.",
  taken: "This name is already taken.",
  name_taken: "This name is already taken.",
  invalid_input: "Check the source settings.",
  invalid_body: "Check the page settings.",
  source_not_found: "The source does not exist. Check the repository, branch and folder.",
  not_found: "This page no longer exists.",
  unreachable: "Backend not reachable",
};

export function pageError(code: string | undefined, status: number) {
  return (code && errorMessages[code]) || `Failed (${status})`;
}

export class PageRequestError extends Error {
  constructor(code: string | undefined, status: number) {
    super(pageError(code, status));
  }
}

export function pageLink(page: SitePage) {
  return page.url || page.path;
}

export function sourceLabel(page: SitePage) {
  if (page.source === "git") {
    const ref = page.ref ? `@${page.ref}` : "";
    const folder = page.folder && page.folder !== "/" ? `/${page.folder.replace(/^\/+/, "")}` : "";
    return `${page.project}/${page.repo}${ref}${folder}`;
  }
  return page.folder || "/";
}

const endpoint = "/pages/api";

async function post<T>(body: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PageRequestError("unreachable", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PageRequestError(data?.error, res.status);
  return data as T;
}

function payload(input: PageInput) {
  const base = { title: input.title.trim(), spa: input.spa, source: input.source };
  return input.source === "git"
    ? { ...base, project: input.project, repo: input.repo, ref: input.ref.trim(), folder: input.folder.trim().replace(/^\/+|\/+$/g, "") }
    : { ...base, folder: input.folder || "/" };
}

export const pagesApi = {
  async check(name: string) {
    const res = await fetch(`${endpoint}?${new URLSearchParams({ op: "check", name })}`);
    if (!res.ok) return null;
    return (await res.json()) as { name: string; available: boolean; reason?: string };
  },
  create: (input: PageInput) => post<SitePage>({ op: "new", name: input.name.trim(), ...payload(input) }),
  update: (name: string, input: PageInput) => post<SitePage>({ op: "update", name, ...payload(input) }),
  setEnabled: (name: string, enabled: boolean) => post<SitePage>({ op: "update", name, enabled }),
  remove: (name: string) => post({ op: "delete", name }),
  async branches(project: string, repo: string) {
    const res = await fetch(`/git/api?${new URLSearchParams({ op: "branches", project, name: repo })}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { branches?: { name: string; default: boolean }[] | null };
    return data.branches ?? [];
  },
};
