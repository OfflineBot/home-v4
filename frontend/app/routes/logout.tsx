import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { api } from "../lib/api";
import { clearedSession, readSession } from "../lib/session";

export async function action({ request }: Route.ActionArgs) {
  const token = await readSession(request.headers.get("Cookie"));

  if (token) {
    await api("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  return redirect("/login", {
    headers: { "Set-Cookie": await clearedSession() },
  });
}

export function loader() {
  return redirect("/");
}
