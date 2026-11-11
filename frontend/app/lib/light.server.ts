import { api, unreachableStatus } from "./api";
import { lightError, type Light } from "./light";

type Result = { ok: boolean; message: string };

const base = "/api/lights";
const deviceTimeoutMs = 15_000;

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function listLights(token: string) {
  const res = await api(`${base}/list`, { headers: headers(token) });
  if (!res.ok) return [];
  const data = (await res.json()) as { lights?: Light[] | null };
  return data.lights ?? [];
}

async function post(token: string, path: string, body: unknown, success: string): Promise<Result> {
  const res = await api(`${base}${path}`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(deviceTimeoutMs),
  });

  if (res.ok) return { ok: true, message: success };

  const data = (await res.json().catch(() => ({}))) as {
    unreachable?: boolean;
    error?: string;
  };
  if (res.status === unreachableStatus && data.unreachable) {
    return { ok: false, message: "Backend not reachable" };
  }
  return { ok: false, message: lightError(data.error, res.status) };
}

export function createLight(token: string, form: FormData) {
  return post(
    token,
    "/new",
    {
      name: String(form.get("name") ?? "").trim(),
      url: String(form.get("url") ?? "").trim(),
    },
    "Light added.",
  );
}

export function deleteLight(token: string, form: FormData) {
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return Promise.resolve({ ok: false, message: "Unknown light." });
  }
  return post(token, "/delete", { id }, "Light removed.");
}
