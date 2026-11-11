import { api, unreachableStatus } from "./api";
import { machineError, type Machine } from "./machine";

type Result = { ok: boolean; message: string };

const base = "/api/machine";

function auth(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function listMachines(token: string) {
  const res = await api(`${base}/terminals/list`, { headers: auth(token) });
  if (!res.ok) return [];
  const data = (await res.json()) as { machines?: Machine[] | null };
  return data.machines ?? [];
}

async function post(token: string, path: string, body: unknown, success: string) {
  const res = await api(`${base}${path}`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(body),
  });

  if (res.ok) return { ok: true, message: success };
  if (res.status === unreachableStatus) {
    return { ok: false, message: "Backend not reachable" };
  }

  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, message: machineError(data.error, res.status) };
}

function port(value: FormDataEntryValue | null) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 65535 ? number : 0;
}

export function createMachine(token: string, form: FormData): Promise<Result> {
  const text = (name: string) => String(form.get(name) ?? "").trim();

  return post(
    token,
    "/terminals/new",
    {
      name: text("name"),
      mac: text("mac"),
      username: text("username"),
      broadcast: text("broadcast"),
      ip: text("ip"),
      ssh_port: port(form.get("ssh_port")),
      wake_on_lan_port: port(form.get("wake_on_lan_port")),
    },
    "Machine added.",
  );
}

function machineId(form: FormData) {
  const id = Number(form.get("id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function deleteMachine(token: string, form: FormData): Promise<Result> {
  const id = machineId(form);
  if (!id) return { ok: false, message: "Unknown machine." };
  return post(token, "/terminals/delete", { id }, "Machine removed.");
}

export async function wakeMachine(token: string, form: FormData): Promise<Result> {
  const id = machineId(form);
  if (!id) return { ok: false, message: "Unknown machine." };
  return post(token, "/wakeMachine", { id }, "Wake signal sent.");
}
