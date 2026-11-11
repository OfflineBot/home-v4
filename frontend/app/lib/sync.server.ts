import { api } from "./api";
import type { SyncJob } from "./sync";

export async function syncState(token: string, job: string) {
  const res = await api("/api/sync", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;

  const jobs: SyncJob[] = (await res.json()).jobs ?? [];
  return jobs.find((entry) => entry.job === job) ?? null;
}
