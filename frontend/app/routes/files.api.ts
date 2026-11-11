import type { Route } from "./+types/files.api";
import { api } from "../lib/api";
import { proxyMedia } from "../lib/media.server";
import { requireToken } from "../lib/session";

const base = "/api/files";
const transferTimeoutMs = 6 * 60 * 60_000;

async function relay(res: Response) {
  const text = await res.text();
  return new Response(text || "{}", {
    status: res.status === 204 ? 200 : res.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function query(params: Record<string, string>) {
  return new URLSearchParams(params).toString();
}

async function sandboxed(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status: response.status, headers });
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const url = new URL(request.url);
  const op = url.searchParams.get("op");
  const path = url.searchParams.get("path") ?? "/";
  const headers = { Authorization: `Bearer ${token}` };

  switch (op) {
    case "list":
      return relay(await api(`${base}/list?${query({ path })}`, { headers }));
    case "usage":
      return relay(await api(`${base}/usage`, { headers }));
    case "download":
      return sandboxed(await proxyMedia(request, `${base}/download?${query({ path })}`));
    case "archive":
      return sandboxed(await proxyMedia(request, `${base}/zip?${query({ path })}`));
    default:
      return Response.json({ error: "invalid_path" }, { status: 400 });
  }
}

export async function action({ request }: Route.ActionArgs) {
  const token = await requireToken(request);
  const headers = { Authorization: `Bearer ${token}` };

  if (request.method === "PUT") {
    const url = new URL(request.url);
    const params = query({
      path: url.searchParams.get("path") ?? "",
      overwrite: url.searchParams.get("overwrite") === "1" ? "true" : "false",
    });
    const init = {
      method: "PUT",
      headers: {
        ...headers,
        "Content-Type": request.headers.get("Content-Type") ?? "application/octet-stream",
      },
      body: request.body,
      duplex: "half",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(transferTimeoutMs)]),
    } as RequestInit;
    return relay(await api(`${base}/upload?${params}`, init));
  }

  const body = (await request.json().catch(() => null)) as {
    op?: unknown;
    path?: unknown;
    to?: unknown;
    id?: unknown;
    overwrite?: unknown;
  } | null;
  const path = typeof body?.path === "string" ? body.path : "";
  const json = { ...headers, "Content-Type": "application/json" };

  switch (body?.op) {
    case "mkdir":
      return relay(await api(`${base}/mkdir`, { method: "POST", headers: json, body: JSON.stringify({ path }) }));
    case "move":
      return relay(
        await api(`${base}/move`, {
          method: "POST",
          headers: json,
          body: JSON.stringify({
            from: path,
            to: typeof body.to === "string" ? body.to : "",
            overwrite: body.overwrite === true,
          }),
        }),
      );
    case "delete":
      return relay(await api(`${base}/delete`, { method: "POST", headers: json, body: JSON.stringify({ path }) }));
    case "archive-restore":
      return relay(
        await api(`${base}/archive/restore`, {
          method: "POST",
          headers: json,
          body: JSON.stringify({ id: String(body.id ?? ""), overwrite: body.overwrite === true }),
        }),
      );
    case "archive-delete":
      return relay(
        await api(`${base}/archive/delete`, { method: "POST", headers: json, body: JSON.stringify({ id: String(body.id ?? "") }) }),
      );
    case "archive-empty":
      return relay(await api(`${base}/archive/empty`, { method: "POST", headers: json, body: "{}" }));
    default:
      return Response.json({ error: "invalid_path" }, { status: 400 });
  }
}
