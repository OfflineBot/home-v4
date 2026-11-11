import type { Route } from "./+types/home";
import { Page } from "../components/page";
import { Badge, Block, Stack } from "../components/block";
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
      <Stack>
        <Block
          title="Backend"
          status={
            online ? (
              <Badge tone="good">Online</Badge>
            ) : (
              <Badge tone="bad">Offline</Badge>
            )
          }
        >
          <p className="text-sm text-ui-fg-muted">
            {online
              ? "Responding on /api/health."
              : "No response on /api/health."}
          </p>
        </Block>
      </Stack>
    </Page>
  );
}
