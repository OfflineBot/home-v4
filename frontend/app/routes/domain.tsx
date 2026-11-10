import type { Route } from "./+types/domain";
import { accent, allItems } from "../lib/nav";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: params.page }];
}

export default function Domain({ params }: Route.ComponentProps) {
  const item = allItems.find((entry) => entry.slug === params.page);

  if (!item) {
    return (
      <main className="w-full p-8">
        <h1 className="text-2xl font-semibold text-ctp-red">Not found</h1>
        <p className="mt-2 text-ctp-subtext0">No page for "{params.page}".</p>
      </main>
    );
  }

  return (
    <main className="w-full p-8" style={accent(item)}>
      <h1 className="text-3xl font-semibold text-[var(--accent)]">
        {item.label}
      </h1>
      <p className="mt-4 text-ctp-subtext0">
        No backend route yet — routes/domain_page/{item.slug}.go is empty.
      </p>
    </main>
  );
}
