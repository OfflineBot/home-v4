import type { Route } from "./+types/machine.terminal";
import { api } from "../lib/api";
import { isDemoMachine } from "../lib/machine-demo";
import { requireToken } from "../lib/session";

const base = "/api/machine/terminals";

async function relay(res: Response) {
  const text = await res.text();
  return new Response(text || "{}", {
    status: res.status === 204 ? 200 : res.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function machineId(params: Route.ActionArgs["params"]) {
  const id = Number(params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const token = await requireToken(request);
  if (isDemoMachine(Number(params.id))) return Response.json({});
  const id = machineId(params);
  if (id === null) return Response.json({ error: "invalid_id" }, { status: 400 });

  return relay(
    await api(`${base}/hostkey?${new URLSearchParams({ id: String(id) })}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const token = await requireToken(request);
  if (isDemoMachine(Number(params.id))) return Response.json({ ticket: "demo" });
  const id = machineId(params);
  const body = (await request.json().catch(() => null)) as { intent?: unknown } | null;
  const path =
    body?.intent === "ticket"
      ? "/ticket"
      : body?.intent === "forget-hostkey"
        ? "/hostkey/delete"
        : null;

  if (id === null || path === null) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  return relay(
    await api(`${base}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id }),
    }),
  );
}
