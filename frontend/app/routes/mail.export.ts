import type { Route } from "./+types/mail.export";
import { proxyMedia } from "../lib/media.server";

const formats = new Set(["json", "jsonl"]);

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "json";
  if (!formats.has(format)) return Response.json({ error: "invalid_export" }, { status: 400 });

  const params = new URLSearchParams({
    format,
    html: url.searchParams.get("html") === "true" ? "true" : "false",
  });
  const folders = (url.searchParams.get("folders") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (folders.length > 0) params.set("folders", folders.join(","));

  return proxyMedia(request, `/api/mail/export?${params}`);
}
