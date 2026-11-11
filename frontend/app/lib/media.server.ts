import { api } from "./api";
import { requireToken } from "./session";

const downloadTimeoutMs = 30 * 60_000;

const passHeaders = [
  "content-type",
  "content-length",
  "content-disposition",
  "content-range",
  "accept-ranges",
  "cache-control",
  "last-modified",
  "etag",
];

export async function proxyMedia(request: Request, path: string) {
  const token = await requireToken(request);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const range = request.headers.get("Range");
  if (range) headers.Range = range;

  const res = await api(path, {
    headers,
    signal: AbortSignal.timeout(downloadTimeoutMs),
  });

  const out = new Headers();
  for (const name of passHeaders) {
    const value = res.headers.get(name);
    if (value) out.set(name, value);
  }

  return new Response(res.body, { status: res.status, headers: out });
}
