import type { Route } from "./+types/git.api";
import { api } from "../lib/api";
import { proxyMedia } from "../lib/media.server";
import { requireToken } from "../lib/session";

const base = "/api/git";

async function relay(res: Response) {
  const text = await res.text();
  return new Response(text || "{}", {
    status: res.status === 204 ? 200 : res.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const url = new URL(request.url);
  const params = url.searchParams;

  if (params.get("op") === "check") {
    return relay(
      await api(`${base}/projects/check?${new URLSearchParams({ name: params.get("name") ?? "" })}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
  }

  if (params.get("op") === "branches") {
    return relay(
      await api(
        `${base}/branches?${new URLSearchParams({ project: params.get("project") ?? "", name: params.get("name") ?? "" })}`,
        { headers: { Authorization: `Bearer ${token}` } },
      ),
    );
  }

  if (params.get("op") === "blob") {
    const query = new URLSearchParams({
      project: params.get("project") ?? "",
      name: params.get("name") ?? "",
      ref: params.get("ref") ?? "",
      path: params.get("path") ?? "",
    });
    const res = await proxyMedia(request, `${base}/blob?${query}`);
    const headers = new Headers(res.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    if (!(headers.get("Content-Type") ?? "").startsWith("application/pdf")) {
      headers.set("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'");
    }
    return new Response(res.body, { status: res.status, headers });
  }

  return Response.json({ error: "not_found" }, { status: 404 });
}

export async function action({ request }: Route.ActionArgs) {
  const token = await requireToken(request);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const send = (path: string, payload: unknown) =>
    api(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(payload) }).then(relay);

  switch (body?.op) {
    case "project-new":
      return send("/projects/new", { name: text(body.name).trim() });
    case "project-delete":
      return send("/projects/delete", { name: text(body.name) });
    case "repo-new":
      return send("/create", {
        project: text(body.project),
        name: text(body.name).trim(),
        description: text(body.description).trim(),
        private: body.private !== false,
      });
    case "repo-update":
      return send("/update", {
        project: text(body.project),
        name: text(body.name),
        ...(typeof body.private === "boolean" ? { private: body.private } : {}),
        ...(typeof body.description === "string" ? { description: body.description.trim() } : {}),
      });
    case "repo-delete":
      return send("/delete", { project: text(body.project), name: text(body.name) });
    case "token-new":
      return send("/tokens/new", { name: text(body.name).trim() });
    case "token-delete":
      return send("/tokens/delete", { id: Number(body.id) });
    default:
      return Response.json({ error: "not_found" }, { status: 400 });
  }
}
