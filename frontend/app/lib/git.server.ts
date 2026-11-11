import { api } from "./api";
import type {
  Branch,
  CommitDetail,
  CommitPage,
  GitToken,
  Project,
  RepoDetail,
  TreeListing,
} from "./git";

const base = "/api/git";

export type Loaded<T> = { ok: true; data: T } | { ok: false; status: number; error: string | undefined };

async function load<T>(token: string, path: string, params: Record<string, string> = {}): Promise<Loaded<T>> {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "")).toString();
  const res = await api(`${base}${path}${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, status: res.status, error: data?.error };
  return { ok: true, data: data as T };
}

export async function listProjects(token: string) {
  const result = await load<{ projects?: Project[] | null }>(token, "/list");
  return result.ok ? (result.data.projects ?? []) : null;
}

export function repoDetail(token: string, project: string, name: string) {
  return load<RepoDetail>(token, "/repo", { project, name });
}

export function readTree(token: string, project: string, name: string, ref: string, path: string) {
  return load<TreeListing>(token, "/tree", { project, name, ref, path });
}

export function readCommits(
  token: string,
  project: string,
  name: string,
  ref: string,
  page: number,
  path = "",
) {
  return load<CommitPage>(token, "/commits", { project, name, ref, path, page: String(page), per_page: "30" });
}

export function readCommit(token: string, project: string, name: string, hash: string) {
  return load<CommitDetail>(token, "/commit", { project, name, hash });
}

export function readBranches(token: string, project: string, name: string) {
  return load<{ default_branch: string; branches: Branch[] | null }>(token, "/branches", { project, name });
}

export async function readText(
  token: string,
  project: string,
  name: string,
  ref: string,
  path: string,
  limit = 512 * 1024,
) {
  const res = await api(`${base}/blob?${new URLSearchParams({ project, name, ref, path })}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  if (Number(res.headers.get("Content-Length")) > limit) {
    await res.body?.cancel();
    return null;
  }
  return res.text();
}

export async function listTokens(token: string) {
  const result = await load<{ tokens?: GitToken[] | null }>(token, "/tokens");
  return result.ok ? (result.data.tokens ?? []) : null;
}
