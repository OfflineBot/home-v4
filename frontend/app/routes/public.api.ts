import type { Route } from "./+types/public.api";
import { api } from "../lib/api";
import { requireToken } from "../lib/session";

const base = "/api/public/manage";

async function relay(res: Response) {
  const text = await res.text();
  return new Response(text || "{}", {
    status: res.status === 204 ? 200 : res.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function action({ request }: Route.ActionArgs) {
  const token = await requireToken(request);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const body = (await request.json().catch(() => null)) as {
    op?: unknown;
    id?: unknown;
    uploads_open?: unknown;
  } | null;

  switch (body?.op) {
    case "delete":
      if (typeof body.id !== "string") break;
      return relay(
        await api(`${base}/delete`, {
          method: "POST",
          headers,
          body: JSON.stringify({ id: body.id }),
        }),
      );
    case "open":
      if (typeof body.uploads_open !== "boolean") break;
      return relay(
        await api(`${base}/settings`, {
          method: "POST",
          headers,
          body: JSON.stringify({ uploads_open: body.uploads_open }),
        }),
      );
    case "key":
      return relay(await api(`${base}/settings/key`, { method: "POST", headers }));
  }

  return Response.json({ error: "invalid_body" }, { status: 400 });
}
