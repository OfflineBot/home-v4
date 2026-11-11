import type { Route } from "./+types/sync.job";
import { api } from "../lib/api";
import { requireToken } from "../lib/session";
import { isSyncJob, type SyncJob } from "../lib/sync";

export async function loader({ request, params }: Route.LoaderArgs) {
  const token = await requireToken(request);
  if (!isSyncJob(params.job)) {
    return Response.json({ error: "unknown_job" }, { status: 404 });
  }

  const res = await api("/api/sync", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return Response.json({ error: "failed" }, { status: res.status });

  const jobs: SyncJob[] = (await res.json()).jobs ?? [];
  return Response.json({
    job: jobs.find((entry) => entry.job === params.job) ?? null,
  });
}

export async function action({ request, params }: Route.ActionArgs) {
  const token = await requireToken(request);
  if (!isSyncJob(params.job)) {
    return Response.json({ error: "unknown_job" }, { status: 404 });
  }

  const res = await api(`/api/sync/${params.job}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
