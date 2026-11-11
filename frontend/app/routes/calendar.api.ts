import type { Route } from "./+types/calendar.api";
import { api } from "../lib/api";
import { parseDay } from "../lib/calendar";
import { requireToken } from "../lib/session";

const base = "/api/calendar";

function bearer(token: string, json = false) {
  return {
    Authorization: `Bearer ${token}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function relay(res: Response) {
  const text = await res.text();
  return new Response(text || "{}", {
    status: res.status === 204 ? 200 : res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!from || !to || !parseDay(from) || !parseDay(to)) {
    return Response.json({ error: "invalid_range" }, { status: 400 });
  }

  return relay(
    await api(`${base}/events?${new URLSearchParams({ from, to })}`, {
      headers: bearer(token),
    }),
  );
}

function target(body: Record<string, unknown>) {
  const id = encodeURIComponent(String(body.id ?? ""));

  switch (body.intent) {
    case "save-event":
      return { path: `${base}/events`, payload: body.event };
    case "delete-event":
      return { path: `${base}/events/${id}/delete`, payload: {} };
    case "mark-event":
      return { path: `${base}/events/${id}/mark`, payload: { mark: body.mark } };
    case "save-category":
      return { path: `${base}/categories`, payload: body.category };
    case "delete-category":
      return { path: `${base}/categories/${id}/delete`, payload: {} };
  }

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const token = await requireToken(request);
  const body = await request.json().catch(() => ({}));
  const route = target(body);

  if (!route) return Response.json({ error: "unknown_action" }, { status: 400 });

  return relay(
    await api(route.path, {
      method: "POST",
      headers: bearer(token, true),
      body: JSON.stringify(route.payload ?? {}),
    }),
  );
}
