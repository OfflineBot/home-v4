import { Link } from "react-router";
import type { Route } from "./+types/files";
import { Block, Stack } from "../components/block";
import { FileBrowser } from "../components/files/browser";
import { Page } from "../components/page";
import { buttonClass } from "../components/setting-row";
import { api, unreachableStatus } from "../lib/api";
import { filesError, normalizePath, toListing, type Usage } from "../lib/files";
import { archiveInfo } from "../lib/files.server";
import { navColor } from "../lib/nav";
import { requireToken } from "../lib/session";

export function meta({ loaderData }: Route.MetaArgs) {
  const path = loaderData?.listing?.path;
  return [{ title: path && path !== "/" ? `${path.split("/").pop()} · Files` : "Files" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const path = normalizePath(new URL(request.url).searchParams.get("path"));
  const headers = { Authorization: `Bearer ${token}` };

  const [list, usage, archive] = await Promise.all([
    api(`/api/files/list?${new URLSearchParams({ path })}`, { headers }),
    api("/api/files/usage", { headers }),
    archiveInfo(token),
  ]);

  if (!list.ok) {
    const data = (await list.json().catch(() => ({}))) as { error?: string };
    return {
      listing: null,
      usage: null,
      archive,
      error:
        list.status === unreachableStatus && !data.error
          ? "Backend not reachable"
          : filesError(data.error, list.status),
    };
  }

  return {
    listing: toListing(await list.json().catch(() => null)),
    usage: usage.ok ? ((await usage.json()) as Usage) : null,
    archive,
    error: null,
  };
}

export default function Files({ loaderData }: Route.ComponentProps) {
  const { listing, usage, archive, error } = loaderData;

  if (!listing) {
    return (
      <Page title="Files" icon="files" color={navColor("files")}>
        <Stack>
          <Block>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ui-fg-muted">{error}</p>
              <Link to="/files" className={`${buttonClass} inline-flex items-center`}>
                Open storage
              </Link>
            </div>
          </Block>
        </Stack>
      </Page>
    );
  }

  return <FileBrowser listing={listing} usage={usage} archive={archive} />;
}
