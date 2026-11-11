import type { Route } from "./+types/moodle.media";
import { proxyMedia } from "../lib/media.server";

const targets: Record<string, (id: string) => string> = {
  file: (id) => `/api/moodle/files/${id}`,
  asset: (id) => `/api/moodle/assets/${id}`,
  image: (id) => `/api/moodle/courses/${id}/image`,
};

export function loader({ request, params }: Route.LoaderArgs) {
  const target = targets[params.kind];
  if (!target) return new Response("Not found", { status: 404 });

  return proxyMedia(request, target(encodeURIComponent(params.id)));
}
