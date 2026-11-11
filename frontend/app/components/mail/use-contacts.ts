import { useEffect, useState } from "react";
import {
  contactMatches,
  foldText,
  minDirectoryQuery,
  type Contact,
} from "../../lib/mail";

type Scope = Contact["source"];

const delays: Record<Scope, number> = { history: 120, directory: 450 };
const cache = new Map<string, Contact[]>();

function cacheKey(scope: Scope, query: string) {
  return `${scope}\n${foldText(query)}`;
}

function wantsDirectory(query: string) {
  return [...query].length >= minDirectoryQuery;
}

async function load(scope: Scope, query: string, signal: AbortSignal) {
  const key = cacheKey(scope, query);
  const known = cache.get(key);
  if (known) return known;

  const params = new URLSearchParams({ scope, q: query });
  const res = await fetch(`/mail/contacts?${params}`, { signal });
  if (!res.ok) return null;

  const data = (await res.json().catch(() => null)) as {
    contacts?: Contact[];
  } | null;
  if (!data) return null;

  const contacts = data.contacts ?? [];
  cache.set(key, contacts);
  return contacts;
}

type Found = Record<Scope, { query: string; contacts: Contact[] }>;

const empty: Found = {
  history: { query: "", contacts: [] },
  directory: { query: "", contacts: [] },
};

export function useContactSuggestions(raw: string, enabled: boolean) {
  const query = raw.trim();
  const [found, setFound] = useState<Found>(empty);

  useEffect(() => {
    if (!enabled || query === "") return;

    const controller = new AbortController();
    const scopes: Scope[] = wantsDirectory(query)
      ? ["history", "directory"]
      : ["history"];
    const timers = scopes.map((scope) =>
      window.setTimeout(() => {
        load(scope, query, controller.signal)
          .then((contacts) => {
            if (contacts) {
              setFound((current) => ({
                ...current,
                [scope]: { query, contacts },
              }));
            }
          })
          .catch(() => {});
      }, cache.has(cacheKey(scope, query)) ? 0 : delays[scope]),
    );

    return () => {
      controller.abort();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [query, enabled]);

  if (!enabled || query === "") return [];

  function pick(scope: Scope) {
    if (scope === "directory" && !wantsDirectory(query)) return [];
    const exact = cache.get(cacheKey(scope, query));
    if (exact) return exact;
    return found[scope].contacts.filter((contact) =>
      contactMatches(contact, query),
    );
  }

  return [pick("history"), pick("directory")];
}
