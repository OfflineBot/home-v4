import type { Machine } from "./machine";

export type TerminalSize = { cols: number; rows: number };

export type LoginPrompt = {
  kind: "password" | "keyboard-interactive";
  name: string;
  instruction: string;
  prompts: { text: string; echo: boolean }[];
  attempt: number;
};

export type HostKeyInfo = {
  keyType: string;
  fingerprint: string;
  expected?: string;
};

export type LinkStatus =
  | { phase: "connecting" }
  | { phase: "login" }
  | { phase: "ready" }
  | { phase: "closed"; error: string | null; code: string | null; hostKey?: HostKeyInfo };

/// What tmux on the machine says it is running, not what this browser
/// happens to remember.
export type TmuxSession = {
  name: string;
  windows: number;
  attached: boolean;
  created: number;
  activity: number;
};

export type TmuxState = {
  installed: boolean;
  sessions: TmuxSession[];
};

export type TerminalHandlers = {
  data: (data: Uint8Array | string) => void;
  status: (status: LinkStatus) => void;
  exit: (code: number | null) => void;
  prompt: (prompt: LoginPrompt) => Promise<string[] | null>;
  hostKey: (key: HostKeyInfo) => Promise<boolean>;
  tmux?: (state: TmuxState) => void;
};

export type TerminalLink = {
  send: (data: string) => void;
  sendBinary: (data: string) => void;
  resize: (size: TerminalSize) => void;
  listSessions: () => void;
  close: () => void;
};

const errorMessages: Record<string, string> = {
  unreachable: "The machine is not reachable.",
  auth_failed: "Login failed.",
  cancelled: "Login cancelled.",
  timeout: "Login timed out.",
  host_key_rejected: "Host key rejected.",
  host_key_changed: "The host key of this machine has changed.",
  too_many_sessions: "Too many open terminals. Close one first.",
  not_found: "This machine no longer exists.",
  shell_failed: "The shell could not be started.",
  ssh_failed: "The SSH connection failed.",
  invalid_ticket: "The connection expired. Try again.",
  connection_lost: "Connection lost.",
};

export function terminalError(code: string | null | undefined) {
  return (code && errorMessages[code]) || "The connection failed.";
}

const sessionPattern = /^[A-Za-z0-9_-]{1,64}$/;

export function sessionNameError(name: string, taken: string[] = []) {
  const trimmed = name.trim();
  if (trimmed === "") return "Enter a session name.";
  if (!sessionPattern.test(trimmed)) {
    return "Use letters, digits, - and _ only.";
  }
  if (taken.includes(trimmed)) return "This session is already open.";
  return null;
}

export function nextSessionName(taken: string[]) {
  let index = 0;
  while (taken.includes(String(index))) index += 1;
  return String(index);
}

function recentKey(machine: Machine) {
  return `machine:${machine.id}:sessions`;
}

export function recentSessions(machine: Machine): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(recentKey(machine)) ?? "[]");
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string" && sessionPattern.test(entry))
      : [];
  } catch {
    return [];
  }
}

function storeRecent(machine: Machine, names: string[]) {
  try {
    window.localStorage.setItem(recentKey(machine), JSON.stringify(names.slice(0, 20)));
  } catch {
    return;
  }
}

export function rememberSession(machine: Machine, name: string) {
  const names = recentSessions(machine).filter((entry) => entry !== name);
  storeRecent(machine, [name, ...names]);
}

export function liveSessions(machine: Machine): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(liveKey(machine)) ?? "[]");
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

export function storeLive(machine: Machine, names: string[]) {
  try {
    window.localStorage.setItem(liveKey(machine), JSON.stringify(names.slice(0, 50)));
  } catch {
    return;
  }
}

function liveKey(machine: Machine) {
  return `machine:${machine.id}:live`;
}

export function forgetSession(machine: Machine, name: string) {
  storeRecent(machine, recentSessions(machine).filter((entry) => entry !== name));
}

export function tmuxCommand(session: string) {
  return ` command -v tmux >/dev/null && exec tmux new-session -A -s '${session}'\r`;
}

const idleMs = 250;
const promptWaitMs = 3000;

async function fetchTicket(machine: Machine) {
  const res = await fetch(`/machine/terminal/${machine.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent: "ticket" }),
  });
  const data = (await res.json().catch(() => ({}))) as { ticket?: string; error?: string };
  if (!res.ok || !data.ticket) throw new Error(data.error ?? "ssh_failed");
  return data.ticket;
}

function socketUrl(ticket: string, size: TerminalSize) {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const params = new URLSearchParams({
    ticket,
    cols: String(size.cols),
    rows: String(size.rows),
  });
  return `${protocol}://${window.location.host}/api/machine/terminals/connect?${params}`;
}

export function openTerminal(
  machine: Machine,
  session: string,
  size: TerminalSize,
  handlers: TerminalHandlers,
): TerminalLink {
  const encoder = new TextEncoder();
  let socket: WebSocket | null = null;
  let closed = false;
  let finished = false;
  let current = size;
  let started = false;
  let idleTimer = 0;
  let fallbackTimer = 0;

  function finish(status: LinkStatus) {
    if (finished) return;
    finished = true;
    window.clearTimeout(idleTimer);
    window.clearTimeout(fallbackTimer);
    handlers.status(status);
  }

  function control(message: Record<string, unknown>) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function startTmux() {
    if (started || closed) return;
    started = true;
    window.clearTimeout(idleTimer);
    window.clearTimeout(fallbackTimer);
    if (socket?.readyState === WebSocket.OPEN) socket.send(encoder.encode(tmuxCommand(session)));
  }

  function scheduleTmux() {
    if (started) return;
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(startTmux, idleMs);
  }

  async function onControl(raw: string) {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    switch (message.type) {
      case "hostkey": {
        handlers.status({ phase: "login" });
        const accept = await handlers.hostKey({
          keyType: String(message.key_type ?? ""),
          fingerprint: String(message.fingerprint ?? ""),
        });
        control({ type: "hostkey", accept });
        return;
      }
      case "prompt": {
        handlers.status({ phase: "login" });
        const prompts = Array.isArray(message.prompts) ? message.prompts : [];
        const answers = await handlers.prompt({
          kind: message.kind === "keyboard-interactive" ? "keyboard-interactive" : "password",
          name: String(message.name ?? ""),
          instruction: String(message.instruction ?? ""),
          prompts: prompts.map((entry: { text?: unknown; echo?: unknown }) => ({
            text: String(entry?.text ?? ""),
            echo: Boolean(entry?.echo),
          })),
          attempt: Number(message.attempt) || 1,
        });
        if (answers === null) control({ type: "cancel" });
        else control({ type: "answer", answers });
        return;
      }
      case "connected":
        handlers.status({ phase: "ready" });
        control({ type: "resize", ...current });
        fallbackTimer = window.setTimeout(startTmux, promptWaitMs);
        scheduleTmux();
        return;
      case "tmux": {
        const raw = Array.isArray(message.sessions) ? message.sessions : [];
        handlers.tmux?.({
          installed: message.tmux !== "missing",
          sessions: raw.map((entry: Record<string, unknown>) => ({
            name: String(entry?.name ?? ""),
            windows: Number(entry?.windows) || 0,
            attached: Boolean(entry?.attached),
            created: Number(entry?.created) || 0,
            activity: Number(entry?.activity) || 0,
          })),
        });
        return;
      }
      case "exit":
        finished = true;
        handlers.exit(typeof message.code === "number" ? message.code : null);
        return;
      case "error": {
        const code = String(message.error ?? "ssh_failed");
        finish({
          phase: "closed",
          code,
          error: terminalError(code),
          hostKey:
            code === "host_key_changed"
              ? {
                  keyType: String(message.key_type ?? ""),
                  fingerprint: String(message.fingerprint ?? ""),
                  expected: String(message.expected ?? ""),
                }
              : undefined,
        });
        return;
      }
    }
  }

  async function connect() {
    handlers.status({ phase: "connecting" });
    let ticket: string;
    try {
      ticket = await fetchTicket(machine);
    } catch (error) {
      const code = error instanceof Error ? error.message : "ssh_failed";
      finish({ phase: "closed", code, error: terminalError(code) });
      return;
    }
    if (closed) return;

    const ws = new WebSocket(socketUrl(ticket, current));
    ws.binaryType = "arraybuffer";
    socket = ws;

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        void onControl(event.data);
        return;
      }
      handlers.data(new Uint8Array(event.data as ArrayBuffer));
      scheduleTmux();
    };
    ws.onclose = () => {
      if (!closed) finish({ phase: "closed", code: "connection_lost", error: terminalError("connection_lost") });
    };
  }

  void connect();

  return {
    send(data) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(encoder.encode(data));
    },
    sendBinary(data) {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(Uint8Array.from(data, (char) => char.charCodeAt(0) & 255));
      }
    },
    resize(size) {
      current = size;
      control({ type: "resize", ...size });
    },
    listSessions() {
      control({ type: "tmux" });
    },
    close() {
      closed = true;
      finished = true;
      window.clearTimeout(idleTimer);
      window.clearTimeout(fallbackTimer);
      socket?.close(1000);
    },
  };
}
