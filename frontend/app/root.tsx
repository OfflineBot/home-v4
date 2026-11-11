import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import { useEffect, useState } from "react";
import type { Route } from "./+types/root";
import { Page } from "./components/page";
import { Block } from "./components/block";
import { buttonClass } from "./components/setting-row";
import { isStaleBuildError, reloadOnce } from "./lib/stale-build";
import { readTheme } from "./lib/theme";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function loader({ request }: Route.LoaderArgs) {
  return { theme: readTheme(request.headers.get("Cookie")) };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");

  return (
    <html lang="en" data-theme={data?.theme ?? "dark"}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-ui-frame font-sans text-ui-fg">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const stale = isStaleBuildError(error);
  const [reloading, setReloading] = useState(stale);

  useEffect(() => {
    if (stale) setReloading(reloadOnce());
  }, [stale]);

  if (stale && reloading) {
    return (
      <Page title="Updating" color="mauve">
        <Block>
          <p className="text-ui-fg-muted">A new version is available. Reloading…</p>
        </Block>
      </Page>
    );
  }

  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (stale) {
    message = "Update";
    details = "A new version is available. Reload the page.";
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <Page title={message} color="red">
      <Block>
        <p className="text-ui-fg-muted">{details}</p>
        {stale && (
          <button type="button" onClick={() => window.location.reload()} className={`${buttonClass} mt-4`}>
            Reload
          </button>
        )}
        {stack && (
          <pre className="mt-4 w-full overflow-x-auto rounded-md bg-ui-field p-4 text-sm">
            <code>{stack}</code>
          </pre>
        )}
      </Block>
    </Page>
  );
}
