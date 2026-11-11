import { api } from "./api";

export const automationBase = "/api/automation";
export const automationTimeoutMs = 90_000;

export function bearer(token: string, json = false) {
  return {
    Authorization: `Bearer ${token}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export function automationGet(token: string, path: string) {
  return api(`${automationBase}${path}`, {
    headers: bearer(token),
    signal: AbortSignal.timeout(automationTimeoutMs),
  });
}

export function automationPost(token: string, path: string, body?: unknown) {
  return api(`${automationBase}${path}`, {
    method: "POST",
    headers: bearer(token, true),
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(automationTimeoutMs),
  });
}

export async function readJSON<T>(res: Response, fallback: T): Promise<T> {
  if (!res.ok) return fallback;
  return ((await res.json().catch(() => fallback)) ?? fallback) as T;
}

export async function relay(res: Response) {
  const text = await res.text();
  return new Response(text || "{}", {
    status: res.status === 204 ? 200 : res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export function segment(value: unknown) {
  return encodeURIComponent(String(value ?? ""));
}
