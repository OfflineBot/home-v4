import type { Route } from "./+types/mail.read";
import { api } from "../lib/api";
import { requireToken } from "../lib/session";

export async function action({ request }: Route.ActionArgs) {
  const token = await requireToken(request);
  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    read?: unknown;
  } | null;

  if (typeof body?.id !== "string" || typeof body.read !== "boolean") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const res = await api("/api/mail/messages/read", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: body.id, read: body.read }),
  });

  return Response.json(
    res.ok ? { read: body.read } : { error: "failed" },
    { status: res.ok ? 200 : res.status },
  );
}
