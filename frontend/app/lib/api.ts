const base = process.env.API_URL ?? "http://localhost:8080";
const timeoutMs = 8000;

export const unreachableStatus = 503;

// never throws: a dead or hanging backend becomes a 503 response, so callers
// handle it like any other failure instead of hitting the error boundary
export async function api(path: string, init?: RequestInit) {
  try {
    return await fetch(`${base}${path}`, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return Response.json({ unreachable: true }, { status: unreachableStatus });
  }
}
