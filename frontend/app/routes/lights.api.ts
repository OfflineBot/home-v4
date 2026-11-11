import type { Route } from "./+types/lights.api";
import { api } from "../lib/api";
import { changeKeys, type LightChange } from "../lib/light";
import { requireToken } from "../lib/session";

const base = "/api/lights";
const deviceTimeoutMs = 12_000;
const reads = new Set(["state", "device", "presets"]);

function lightId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

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
  const op = url.searchParams.get("op") ?? "";
  const id = lightId(url.searchParams.get("id"));

  if (!reads.has(op) || id === null) {
    return Response.json({ error: "invalid_id" }, { status: 400 });
  }

  return relay(
    await api(`${base}/${op}?${new URLSearchParams({ id: String(id) })}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(deviceTimeoutMs),
    }),
  );
}

function cleanChange(raw: unknown): LightChange | null {
  if (typeof raw !== "object" || raw === null) return null;
  const source = raw as Record<string, unknown>;
  const change: Record<string, unknown> = {};

  for (const key of changeKeys) {
    if (source[key] === undefined) continue;
    const value = source[key];
    const valid =
      key === "on"
        ? typeof value === "boolean"
        : key === "color"
          ? typeof value === "string"
          : Number.isInteger(value);
    if (!valid) return null;
    change[key] = value;
  }

  return Object.keys(change).length > 0 ? (change as LightChange) : null;
}

export async function action({ request }: Route.ActionArgs) {
  const token = await requireToken(request);
  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    change?: unknown;
  } | null;
  const id = lightId(body?.id);
  const change = cleanChange(body?.change);

  if (id === null || change === null) {
    return Response.json({ error: "invalid_change" }, { status: 400 });
  }

  return relay(
    await api(`${base}/state`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, ...change }),
      signal: AbortSignal.timeout(deviceTimeoutMs),
    }),
  );
}
