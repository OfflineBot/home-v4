import { Link } from "react-router";
import type { Route } from "./+types/home";
import { api } from "../lib/api";

export function meta() {
  return [{ title: "Home V4" }];
}

export async function loader() {
  try {
    const res = await api("/api/health");
    return { online: res.ok };
  } catch {
    return { online: false };
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { online } = loaderData;

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-semibold text-ctp-mauve">Home V4</h1>

      <p className="mt-6 flex items-center gap-2 text-ctp-subtext0">
        <span
          className={`size-2 rounded-full ${online ? "bg-ctp-green" : "bg-ctp-red"}`}
        />
        Backend {online ? "reachable" : "unreachable"}
      </p>

      <Link
        to="/login"
        className="mt-8 inline-block rounded-md bg-ctp-surface0 px-4 py-2 hover:bg-ctp-surface1"
      >
        Login
      </Link>
    </main>
  );
}
