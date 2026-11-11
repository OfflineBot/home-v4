import { Outlet, redirect } from "react-router";
import type { Route } from "./+types/app";
import { Sidebar } from "../components/sidebar";
import { api } from "../lib/api";
import { clearedSession, readSession } from "../lib/session";
import { readSidebarOpen } from "../lib/sidebar";

export async function loader({ request }: Route.LoaderArgs) {
  const cookie = request.headers.get("Cookie");
  const token = await readSession(cookie);

  if (!token) {
    throw redirect("/login");
  }

  const res = await api("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 || res.status === 403) {
    throw redirect("/login", {
      headers: { "Set-Cookie": await clearedSession() },
    });
  }

  return {
    user: res.ok ? await res.json() : null,
    sidebarOpen: readSidebarOpen(cookie),
  };
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex h-screen overflow-hidden py-3 pr-3">
      <Sidebar defaultOpen={loaderData.sidebarOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
