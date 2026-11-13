import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/explore";
import { Block, Stack } from "../components/block";
import { Icon } from "../components/icons";
import { Page } from "../components/page";
import { primaryButtonClass } from "../components/setting-row";
import { Sidebar } from "../components/sidebar";
import { api } from "../lib/api";
import { formatSize } from "../lib/moodle";
import { accentVars, navColor } from "../lib/nav";
import { readSession } from "../lib/session";
import { readSidebarOpen } from "../lib/sidebar";

type Repo = {
  project: string;
  name: string;
  owner: string;
  description: string;
  clone_path: string;
  created_at: string;
};

type SitePage = {
  name: string;
  title: string;
  owner: string;
  path: string;
  url?: string;
  updated_at: string;
};

type PublicFile = {
  id: string;
  name: string;
  size: number;
  uploader: string;
  created_at: string;
  downloads: number;
};

type Release = {
  version: string;
  build: number;
  name: string;
  path: string;
  size: number;
};

type Listing = {
  repos: Repo[];
  pages: SitePage[];
  files: PublicFile[];
  app: Release | null;
};

const empty: Listing = { repos: [], pages: [], files: [], app: null };

export function meta() {
  return [{ title: "Explore" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const cookie = request.headers.get("Cookie");
  const token = await readSession(cookie);

  const [res, me] = await Promise.all([
    api("/api/explore"),
    token
      ? api("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      : null,
  ]);

  const listing = res.ok ? ((await res.json()) as Listing) : empty;
  const user = me?.ok ? await me.json() : null;

  return {
    repos: listing.repos ?? [],
    pages: listing.pages ?? [],
    files: listing.files ?? [],
    app: listing.app ?? null,
    signedIn: user !== null,
    isAdmin: user?.is_admin === true,
    sidebarOpen: readSidebarOpen(cookie),
  };
}

// the same list serves a visitor and a signed-in user; only the frame differs
function Frame({
  signedIn,
  isAdmin,
  sidebarOpen,
  children,
}: {
  signedIn: boolean;
  isAdmin: boolean;
  sidebarOpen: boolean;
  children: ReactNode;
}) {
  if (signedIn) {
    return (
      <div className="flex h-screen overflow-hidden py-3 pr-3">
        <Sidebar defaultOpen={sidebarOpen} isAdmin={isAdmin} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Page title="Explore" icon="explore" color={navColor("explore")}>
            {children}
          </Page>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <header className="flex items-center gap-3">
          <span className="grid size-6 place-items-center text-ctp-mauve">
            <Icon name="home" className="size-5" />
          </span>
          <span className="text-lg font-semibold text-ctp-mauve">home-v4</span>
          <Link to="/login" className={`${primaryButtonClass} ml-auto`}>
            Sign in
          </Link>
        </header>

        <p className="text-sm text-ui-fg-muted">
          Everything below is open to everyone. No account needed.
        </p>

        {children}
      </div>
    </div>
  );
}

function Count({ value }: { value: number }) {
  return (
    <span className="ml-auto text-xs text-ui-fg-muted tabular-nums">
      {value}
    </span>
  );
}

function Nothing({ message }: { message: string }) {
  return <p className="text-sm text-ui-fg-muted">{message}</p>;
}

export default function Explore({ loaderData }: Route.ComponentProps) {
  const { repos, pages, files, app, signedIn, isAdmin, sidebarOpen } =
    loaderData;

  return (
    <Frame signedIn={signedIn} isAdmin={isAdmin} sidebarOpen={sidebarOpen}>
      <Stack>
        {app && (
          <Block title="Android app">
            <div className="flex flex-wrap items-center gap-3">
              <Icon
                name="download"
                className="size-4 shrink-0 text-ui-fg-muted"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-ui-fg">
                  Version {app.version}
                </span>
                <span className="block text-xs text-ui-fg-muted tabular-nums">
                  {formatSize(app.size)} · installs over the browser
                </span>
              </span>
              <a href={app.path} className={primaryButtonClass + " leading-9"}>
                Download
              </a>
            </div>
          </Block>
        )}

        <Block title="Repositories" status={<Count value={repos.length} />}>
          {repos.length === 0 ? (
            <Nothing message="No public repository yet." />
          ) : (
            <ul className="flex flex-col gap-3">
              {repos.map((repo) => (
                <li
                  key={repo.clone_path}
                  style={accentVars("peach")}
                  className="flex items-start gap-3"
                >
                  <Icon
                    name="git"
                    className="mt-0.5 size-4 shrink-0 text-[var(--accent-fg)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ui-fg">
                      {repo.project}/{repo.name}
                      <span className="ml-2 text-xs text-ui-fg-faint">
                        {repo.owner}
                      </span>
                    </p>
                    {repo.description && (
                      <p className="truncate text-xs text-ui-fg-muted">
                        {repo.description}
                      </p>
                    )}
                    <code className="mt-1 block truncate text-xs text-ui-fg-faint">
                      git clone {repo.clone_path}
                    </code>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block title="Pages" status={<Count value={pages.length} />}>
          {pages.length === 0 ? (
            <Nothing message="No published page yet." />
          ) : (
            <ul className="flex flex-col gap-3">
              {pages.map((page) => (
                <li
                  key={page.name}
                  style={accentVars("lavender")}
                  className="flex items-start gap-3"
                >
                  <Icon
                    name="pages"
                    className="mt-0.5 size-4 shrink-0 text-[var(--accent-fg)]"
                  />
                  <div className="min-w-0 flex-1">
                    <a
                      href={page.url || page.path}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-sm text-ui-fg hover:underline"
                    >
                      {page.title || page.name}
                    </a>
                    <p className="truncate text-xs text-ui-fg-muted">
                      {page.url || page.path}
                      <span className="ml-2 text-ui-fg-faint">
                        {page.owner}
                      </span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block title="Files" status={<Count value={files.length} />}>
          {files.length === 0 ? (
            <Nothing message="No shared file yet." />
          ) : (
            <ul className="flex flex-col gap-3">
              {files.map((file) => (
                <li
                  key={file.id}
                  style={accentVars("flamingo")}
                  className="flex items-start gap-3"
                >
                  <Icon
                    name="file"
                    className="mt-0.5 size-4 shrink-0 text-[var(--accent-fg)]"
                  />
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/api/public/files/${file.id}/${encodeURIComponent(file.name)}`}
                      className="block truncate text-sm text-ui-fg hover:underline"
                    >
                      {file.name}
                    </a>
                    <p className="truncate text-xs text-ui-fg-muted tabular-nums">
                      {formatSize(file.size)} · {file.downloads} downloads
                      {file.uploader && ` · ${file.uploader}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Block>
      </Stack>
    </Frame>
  );
}
