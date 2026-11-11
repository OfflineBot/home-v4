export type Machine = {
  id: number;
  name: string;
  mac: string;
  username: string;
  broadcast: string;
  ip: string;
  ssh_port: number;
  wake_on_lan_port: number;
};

export type MachineStatus = {
  id: number;
  online: boolean;
  checked_at: string;
};

export const defaultSSHPort = 22;
export const defaultWakeOnLanPort = 9;

const errorMessages: Record<string, string> = {
  invalid_machine: "Check the machine details.",
  invalid_body: "Check the machine details.",
  duplicate: "This name or MAC address is already used.",
  not_found: "This machine no longer exists.",
  wake_failed: "Wake on LAN failed.",
};

export function machineError(code: string | undefined, status: number) {
  return (code && errorMessages[code]) || `Failed (${status})`;
}

export function machineHref(id: number) {
  return `/machine?${new URLSearchParams({ m: String(id) })}`;
}
