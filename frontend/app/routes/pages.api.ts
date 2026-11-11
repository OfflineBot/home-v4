import type { Route } from "./+types/pages.api";
import { api } from "../lib/api";
import { requireToken } from "../lib/session";

const base = "/api/pages";
const fields = ["title", "source", "project", "repo", "ref", "folder"] as const;

async function relay(res: Response) {
  const text = await res.text();
  return new Response(text || "{}", {
    status: res.status === 204 ? 200 : res.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const url = new URL(request.url);
  if (url.searchParams.get("op") !== "check") {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return relay(
    await api(`${base}/check?${new URLSearchParams({ name: url.searchParams.get("name") ?? "" })}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
}

function clean(body: Record<string, unknown>) {
  const out: Record<string, unknown> = { name: typeof body.name === "string" ? body.name : "" };
  for (const field of fields) if (typeof body[field] === "string") out[field] = body[field];
  if (typeof body.spa === "boolean") out.spa = body.spa;
  if (typeof body.enabled === "boolean") out.enabled = body.enabled;
  return out;
}

export async function action({ request }: Route.ActionArgs) {
  const token = await requireToken(request);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const path = body?.op === "new" ? "/new" : body?.op === "update" ? "/update" : body?.op === "delete" ? "/delete" : null;
  if (!body || !path) return Response.json({ error: "invalid_body" }, { status: 400 });

  return relay(
    await api(`${base}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(path === "/delete" ? { name: clean(body).name } : clean(body)),
    }),
  );
}
