import type { Machine, MachineStatus } from "./machine";
import type { TerminalHandlers, TerminalLink, TerminalSize } from "./terminal";

export const demoMachines: Machine[] = [
  {
    id: -1,
    name: "Desktop",
    mac: "02:00:00:00:00:01",
    username: "user",
    broadcast: "192.0.2.255",
    ip: "192.0.2.10",
    ssh_port: 22,
    wake_on_lan_port: 9,
  },
  {
    id: -2,
    name: "Server",
    mac: "02:00:00:00:00:02",
    username: "admin",
    broadcast: "192.0.2.255",
    ip: "192.0.2.11",
    ssh_port: 22,
    wake_on_lan_port: 9,
  },
];

export function isDemoMachine(id: number) {
  return id < 0;
}

export function demoStatus(id: number): MachineStatus {
  return { id, online: id === -1, checked_at: new Date().toISOString() };
}

const reset = "\x1b[0m";
const color = {
  green: "\x1b[32m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

const files = [
  `${color.blue}${color.bold}Documents${reset}`,
  `${color.blue}${color.bold}Downloads${reset}`,
  `${color.blue}${color.bold}projects${reset}`,
  "notes.md",
  `${color.green}backup.sh${reset}`,
];

const startedAt = Date.now();
const connectMs = 450;

export function openDemoTerminal(
  machine: Machine,
  session: string,
  size: TerminalSize,
  handlers: TerminalHandlers,
): TerminalLink {
  const host = machine.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "demo";
  const user = machine.username || "user";
  const history: string[] = [];
  let line = "";
  let cursor = history.length;
  let closed = false;
  let columns = size.cols;

  const write = (text: string) => {
    if (!closed) handlers.data(text);
  };
  const prompt = () => write(`${color.green}${user}${reset}@${color.blue}${host}${reset} ${color.magenta}~${reset}> `);
  const redraw = () => write(`\r\x1b[2K`);

  function uptime() {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60_000));
    return `up ${minutes} min, 1 user, load average: 0.08, 0.12, 0.10`;
  }

  function run(input: string) {
    const [command = "", ...args] = input.trim().split(/\s+/);
    switch (command) {
      case "":
        return;
      case "help":
        write(`Demo shell. Try: ${["ls", "pwd", "whoami", "hostname", "date", "uptime", "uname", "echo", "fastfetch", "tmux ls", "clear", "exit"].join(", ")}\r\n`);
        return;
      case "ls":
        write(`${files.join("  ")}\r\n`);
        return;
      case "pwd":
        write(`/home/${user}\r\n`);
        return;
      case "whoami":
        write(`${user}\r\n`);
        return;
      case "hostname":
        write(`${host}\r\n`);
        return;
      case "date":
        write(`${new Date().toString()}\r\n`);
        return;
      case "uptime":
        write(`${uptime()}\r\n`);
        return;
      case "uname":
        write(args.includes("-a") ? `Linux ${host} 6.12.0 #1 SMP x86_64 GNU/Linux\r\n` : "Linux\r\n");
        return;
      case "echo":
        write(`${args.join(" ")}\r\n`);
        return;
      case "clear":
        write("\x1b[2J\x1b[H");
        return;
      case "tmux":
        write(`${session}: 1 windows (created ${new Date(startedAt).toLocaleTimeString("en-GB")}) (attached)\r\n`);
        return;
      case "fastfetch":
      case "neofetch":
        write(
          [
            `${color.cyan}${color.bold}${user}@${host}${reset}`,
            `${color.dim}${"-".repeat(Math.min(columns - 2, user.length + host.length + 1))}${reset}`,
            `${color.cyan}OS${reset}       Linux x86_64 (demo)`,
            `${color.cyan}Kernel${reset}   6.12.0`,
            `${color.cyan}Uptime${reset}   ${uptime().split(",")[0].replace("up ", "")}`,
            `${color.cyan}Shell${reset}    fish 3.7`,
            `${color.cyan}Terminal${reset} home-v4 (${columns}x${size.rows})`,
            `${color.cyan}Memory${reset}   3.1 GiB / 16 GiB`,
            "",
          ].join("\r\n"),
        );
        return;
      case "exit":
      case "logout":
        write("logout\r\n");
        closed = true;
        handlers.exit(0);
        return;
      default:
        write(`${color.red}fish: Unknown command: ${command}${reset}\r\n`);
    }
  }

  function handle(data: string) {
    if (closed) return;
    let rest = data;

    while (rest.length > 0) {
      if (rest.startsWith("\x1b[A") || rest.startsWith("\x1b[B")) {
        const up = rest.startsWith("\x1b[A");
        cursor = Math.max(0, Math.min(history.length, cursor + (up ? -1 : 1)));
        line = history[cursor] ?? "";
        redraw();
        prompt();
        write(line);
        rest = rest.slice(3);
        continue;
      }
      if (rest.startsWith("\x1b")) {
        const match = rest.match(/^\x1b(\[[0-9;]*[A-Za-z~]|O[A-Za-z]|.)/);
        rest = rest.slice(match ? match[0].length : 1);
        continue;
      }

      const char = rest[0];
      rest = rest.slice(1);

      if (char === "\r" || char === "\n") {
        write("\r\n");
        if (line.trim()) history.push(line);
        cursor = history.length;
        run(line);
        line = "";
        if (!closed) prompt();
      } else if (char === "\x7f" || char === "\b") {
        if (line.length > 0) {
          line = line.slice(0, -1);
          write("\b \b");
        }
      } else if (char === "\x03") {
        write("^C\r\n");
        line = "";
        prompt();
      } else if (char === "\x0c") {
        write("\x1b[2J\x1b[H");
        prompt();
        write(line);
      } else if (char === "\x04") {
        if (line === "") run("exit");
      } else if (char >= " ") {
        line += char;
        write(char);
      }
    }
  }

  handlers.status({ phase: "connecting" });
  const timer = window.setTimeout(() => {
    if (closed) return;
    handlers.status({ phase: "ready" });
    write(`${color.dim}Demo machine. Nothing here is real. Type ${reset}${color.yellow}help${reset}${color.dim} for commands.${reset}\r\n\r\n`);
    prompt();
  }, connectMs);

  return {
    send: handle,
    sendBinary: handle,
    resize(next) {
      columns = next.cols;
    },
    close() {
      closed = true;
      window.clearTimeout(timer);
    },
  };
}
