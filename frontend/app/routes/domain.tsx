import { data } from "react-router";
import type { Route } from "./+types/domain";
import { Block, Stack } from "../components/block";
import { Page } from "../components/page";

export function meta() {
  return [{ title: "Not found" }];
}

export function loader({ params }: Route.LoaderArgs) {
  return data({ page: params.page }, { status: 404 });
}

export default function NotFound({ loaderData }: Route.ComponentProps) {
  return (
    <Page title="Not found" color="red">
      <Stack>
        <Block>
          <p className="text-sm text-ui-fg-muted">No page for "{loaderData.page}".</p>
        </Block>
      </Stack>
    </Page>
  );
}
