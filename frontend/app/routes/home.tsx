import type { Route } from "./+types/home";
import { Page } from "../components/page";
import { Panel } from "../components/panel";
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
    <Page title="home-v4" icon="home">
      <Panel title="Backend">
        <p className="flex items-center gap-2 text-ctp-subtext0">
          <span
            className={`size-2.5 rounded-full ${
              online ? "bg-ctp-green" : "bg-ctp-red"
            }`}
          />
          {online ? "reachable" : "unreachable"}
        </p>
      </Panel>
    </Page>
  );
}
