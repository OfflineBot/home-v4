import type { Route } from "./+types/domain";
import { Block, Stack } from "../components/block";
import { Page } from "../components/page";
import { allItems } from "../lib/nav";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: params.page }];
}

//TODO: NOT WIRED!
export default function Domain({ params }: Route.ComponentProps) {
  const item = allItems.find((entry) => entry.slug === params.page);

  if (!item) {
    return (
      <Page title="Not found" color="red">
        <Stack>
          <Block>
            <p className="text-sm text-ui-fg-muted">
              No page for "{params.page}".
            </p>
          </Block>
        </Stack>
      </Page>
    );
  }

  return (
    <Page title={item.label} color={item.color} icon={item.slug}>
      <Stack>
        <Block title="Status">
          <p className="text-sm text-ui-fg-muted">
            No backend route yet — routes/domain_page/{item.slug}.go is empty.
          </p>
        </Block>
      </Stack>
    </Page>
  );
}
