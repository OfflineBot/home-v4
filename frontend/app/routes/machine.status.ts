import type { Route } from "./+types/machine.status";
import { api } from "../lib/api";
import { demoStatus, isDemoMachine } from "../lib/machine-demo";
import { requireToken } from "../lib/session";

export async function loader({ request, params }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const id = Number(params.id);
  if (Number.isInteger(id) && isDemoMachine(id)) {
    return Response.json(demoStatus(id), { headers: { "Cache-Control": "no-store" } });
  }
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "invalid_id" }, { status: 400 });
  }

  const res = await api(`/api/machine/status?${new URLSearchParams({ id: String(id) })}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));

  return Response.json(data, {
    status: res.status,
    headers: { "Cache-Control": "no-store" },
  });
}
