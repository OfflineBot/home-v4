const base = process.env.API_URL ?? "http://localhost:8080";

export function api(path: string, init?: RequestInit) {
  return fetch(`${base}${path}`, init);
}
