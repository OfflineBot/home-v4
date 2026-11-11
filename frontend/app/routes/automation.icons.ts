import type { Route } from "./+types/automation.icons";
import { api } from "../lib/api";
import { bearer } from "../lib/automation.server";
import { requireToken } from "../lib/session";

const iconPattern = /^[A-Za-z0-9@._\/-]+\.(svg|png)$/;
const passHeaders = [
  "content-type",
  "cache-control",
  "content-security-policy",
  "x-content-type-options",
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const path = params["*"] ?? "";

  if (!iconPattern.test(path) || path.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const res = await api(`/api/automation/icons/${path}`, {
    headers: bearer(token),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  for (const name of passHeaders) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(res.body, { status: 200, headers });
}
