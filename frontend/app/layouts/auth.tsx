import { Outlet, redirect } from "react-router";
import type { Route } from "./+types/auth";
import { Icon } from "../components/icons";
import { readSession } from "../lib/session";

export async function loader({ request }: Route.LoaderArgs) {
  if (await readSession(request.headers.get("Cookie"))) {
    throw redirect("/");
  }
  return null;
}

export default function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-6 place-items-center text-ctp-mauve">
          <Icon name="home" className="size-5" />
        </span>
        <span className="text-lg font-semibold text-ctp-mauve">home-v4</span>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-ui-border bg-ui-surface p-6">
        <Outlet />
      </div>
    </div>
  );
}
