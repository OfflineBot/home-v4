import type { Route } from "./+types/domain";
import { Page } from "../components/page";
import { Panel } from "../components/panel";
import { allItems } from "../lib/nav";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: params.page }];
}

export default function Domain({ params }: Route.ComponentProps) {
  const item = allItems.find((entry) => entry.slug === params.page);

  if (!item) {
    return (
      <Page title="Not found" color="red">
        <Panel>
          <p className="text-ctp-subtext0">No page for "{params.page}".</p>
        </Panel>
      </Page>
    );
  }

  return (
    <Page title={item.label} color={item.color} icon={item.slug}>
      <Panel title="Status">
        <p className="text-ctp-subtext0">
          No backend route yet — routes/domain_page/{item.slug}.go is empty.
        </p>
      </Panel>
    </Page>
  );
}
