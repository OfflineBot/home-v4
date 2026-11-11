import type { Route } from "./+types/moodle.zip";
import { proxyMedia } from "../lib/media.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return new Response("Not found", { status: 404 });
  }

  const res = await proxyMedia(request, `/api/moodle/courses/${id}/zip`);
  if (res.ok) return res;

  await res.body?.cancel();
  return new Response("Course not available", {
    status: res.status === 404 ? 404 : 502,
  });
}
