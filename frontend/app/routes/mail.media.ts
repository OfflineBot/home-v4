import type { Route } from "./+types/mail.media";
import { proxyMedia } from "../lib/media.server";

export function loader({ request, params }: Route.LoaderArgs) {
  return proxyMedia(
    request,
    `/api/mail/attachments/${encodeURIComponent(params.id)}`,
  );
}
