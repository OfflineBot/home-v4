import type { Route } from "./+types/mail.contacts";
import { api } from "../lib/api";
import { minDirectoryQuery, type Contact } from "../lib/mail";
import { requireToken } from "../lib/session";

const historyLimit = 8;

type Suggestion = { name?: string; email?: string; source?: string };

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const directory = url.searchParams.get("scope") === "directory";

  if (directory && [...q].length < minDirectoryQuery) {
    return Response.json({ contacts: [] });
  }

  const path = directory
    ? `/api/mail/contacts/directory?${new URLSearchParams({ q })}`
    : `/api/mail/contacts?${new URLSearchParams({ q, limit: String(historyLimit) })}`;
  const res = await api(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return Response.json({ contacts: [] }, { status: res.status });
  }

  const data = (await res.json()) as { contacts?: Suggestion[] | null };
  const contacts: Contact[] = (data.contacts ?? [])
    .filter((entry) => entry.email?.includes("@"))
    .map((entry) => ({
      name: entry.name ?? "",
      email: entry.email ?? "",
      source: directory ? "directory" : "history",
    }));

  return Response.json({ contacts });
}
