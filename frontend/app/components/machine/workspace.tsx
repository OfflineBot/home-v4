import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "../dialog";
import { Icon } from "../icons";
import { buttonClass, dangerButtonClass } from "../setting-row";
import { Toast } from "../toast";
import { HostKeyChangedDialog, HostKeyDialog } from "./hostkey-dialog";
import { PromptDialog } from "./prompt-dialog";
import { SessionList } from "./session-list";
import { TerminalView, type TerminalSink } from "./terminal-view";
import type { Machine } from "../../lib/machine";
import {
  forgetSession,
  nextSessionName,
  openTerminal,
  recentSessions,
  rememberSession,
  sessionNameError,
  type HostKeyInfo,
  type LinkStatus,
  type LoginPrompt,
  type TerminalSize,
} from "../../lib/terminal";

type Tab = {
  id: string;
  session: string;
  title: string;
  status: LinkStatus;
  opened: boolean;
  generation: number;
};

type PromptAsk = {
  id: number;
  tab: string;
  session: string;
  prompt: LoginPrompt;
  resolve: (answers: string[] | null) => void;
};

type HostKeyAsk = {
  id: number;
  tab: string;
  key: HostKeyInfo;
  resolve: (accept: boolean) => void;
};

let tabCounter = 0;
let askCounter = 0;

function tabId() {
  tabCounter += 1;
  return `${Date.now().toString(36)}-${tabCounter}`;
}

function newTab(session: string, opened: boolean): Tab {
  return { id: tabId(), session, title: "", status: { phase: "connecting" }, opened, generation: 0 };
}

function tabsKey(machine: Machine) {
  return `machine:${machine.id}:tabs`;
}

function readTabs(machine: Machine): { sessions: string[]; active: number } | null {
  try {
    const raw = window.localStorage.getItem(tabsKey(machine));
    const value = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(value?.sessions)) return null;
    return {
      sessions: value.sessions.filter(
        (entry: unknown): entry is string =>
          typeof entry === "string" && sessionNameError(entry) === null,
      ),
      active: Number(value.active) || 0,
    };
  } catch {
    return null;
  }
}

function writeTabs(machine: Machine, tabs: Tab[], active: string | null) {
  try {
    window.localStorage.setItem(
      tabsKey(machine),
      JSON.stringify({
        sessions: tabs.map((tab) => tab.session),
        active: Math.max(0, tabs.findIndex((tab) => tab.id === active)),
      }),
    );
  } catch {
    return;
  }
}

const iconButtonClass =
  "grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-ui-fg-muted outline-none transition-colors hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none";

function statusDot(tab: Tab, active: boolean) {
  if (!tab.opened) return "bg-ui-border-strong";
  switch (tab.status.phase) {
    case "ready":
      return active ? "bg-[var(--accent)]" : "bg-ctp-green";
    case "closed":
      return "bg-ui-danger";
    default:
      return "animate-pulse bg-ctp-yellow motion-reduce:animate-none";
  }
}

export function TerminalWorkspace({ machine }: { machine: Machine }) {
  const root = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [closing, setClosing] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [menu, setMenu] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [failure, setFailure] = useState({ message: "", attempt: 0 });
  const [prompts, setPrompts] = useState<PromptAsk[]>([]);
  const [hostKeys, setHostKeys] = useState<HostKeyAsk[]>([]);
  const [changed, setChanged] = useState<{ tab: string; key: HostKeyInfo } | null>(null);
  const [forgetting, setForgetting] = useState(false);

  const fail = useCallback((message: string) => {
    setFailure((current) => ({ message, attempt: current.attempt + 1 }));
  }, []);

  useEffect(() => {
    const stored = readTabs(machine);
    const known = recentSessions(machine);
    const names = (stored?.sessions ?? []).filter((name, index, all) => all.indexOf(name) === index);
    if (names.length === 0) names.push(known[0] ?? "main");

    const activeIndex = Math.min(stored?.active ?? 0, names.length - 1);
    const restored = names.map((name, index) => newTab(name, index === activeIndex));
    setTabs(restored);
    setActive(restored[activeIndex]?.id ?? null);
    setRecent(known);
    setReady(true);
  }, [machine]);

  useEffect(() => {
    if (ready) writeTabs(machine, tabs, active);
  }, [machine, ready, tabs, active]);

  useEffect(() => {
    if (active !== null && !tabs.some((tab) => tab.id === active)) {
      setActive(tabs[tabs.length - 1]?.id ?? null);
    }
  }, [tabs, active]);

  useEffect(() => {
    function onChange() {
      setFullscreen(document.fullscreenElement === root.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!menu) return;

    function onPointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(false);
    }

    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function updateTab(id: string, update: (tab: Tab) => Tab) {
    setTabs((current) => current.map((tab) => (tab.id === id ? update(tab) : tab)));
  }

  function select(id: string) {
    setActive(id);
    updateTab(id, (tab) => (tab.opened ? tab : { ...tab, opened: true }));
  }

  function open(raw: string) {
    const name = raw.trim();
    const error = sessionNameError(name);
    if (error) {
      fail(error);
      return;
    }

    setMenu(false);
    const existing = tabs.find((tab) => tab.session === name);
    if (existing) {
      select(existing.id);
      return;
    }

    const tab = newTab(name, true);
    setTabs((current) => [...current, tab]);
    setActive(tab.id);
    rememberSession(machine, name);
    setRecent(recentSessions(machine));
  }

  function create() {
    open(nextSessionName([...tabs.map((tab) => tab.session), ...recent]));
  }

  function forget(name: string) {
    forgetSession(machine, name);
    setRecent(recentSessions(machine));
  }

  function dropAsks(id: string) {
    setPrompts((current) => {
      for (const ask of current) if (ask.tab === id) ask.resolve(null);
      return current.filter((ask) => ask.tab !== id);
    });
    setHostKeys((current) => {
      for (const ask of current) if (ask.tab === id) ask.resolve(false);
      return current.filter((ask) => ask.tab !== id);
    });
  }

  function askClose(id: string) {
    const tab = tabs.find((entry) => entry.id === id);
    if (!tab || tab.status.phase === "closed") close(id);
    else setClosing(id);
  }

  function close(id: string) {
    dropAsks(id);
    const index = tabs.findIndex((tab) => tab.id === id);
    const next = tabs.filter((tab) => tab.id !== id);
    setTabs(next);
    if (active === id) {
      const neighbour = next[Math.min(index, next.length - 1)];
      if (neighbour) select(neighbour.id);
      else setActive(null);
    }
  }

  function reconnect(id: string) {
    updateTab(id, (tab) => ({
      ...tab,
      opened: true,
      status: { phase: "connecting" },
      generation: tab.generation + 1,
    }));
  }

  function setStatus(id: string, status: LinkStatus) {
    updateTab(id, (tab) => ({ ...tab, status }));
    if (status.phase === "closed" && status.code === "host_key_changed" && status.hostKey) {
      setChanged({ tab: id, key: status.hostKey });
    }
  }

  function connectFor(tab: Tab) {
    return (size: TerminalSize, sink: TerminalSink) =>
      openTerminal(machine, tab.session, size, {
        ...sink,
        prompt: (prompt) =>
          new Promise((resolve) => {
            if (prompt.attempt > 1) fail("Wrong password.");
            askCounter += 1;
            setPrompts((current) => [
              ...current,
              { id: askCounter, tab: tab.id, session: tab.session, prompt, resolve },
            ]);
          }),
        hostKey: (key) =>
          new Promise((resolve) => {
            askCounter += 1;
            setHostKeys((current) => [...current, { id: askCounter, tab: tab.id, key, resolve }]);
          }),
      });
  }

  function answerPrompt(answers: string[] | null) {
    const [first, ...rest] = prompts;
    if (!first) return;
    setPrompts(rest);
    first.resolve(answers);
  }

  function answerHostKey(accept: boolean) {
    const [first, ...rest] = hostKeys;
    if (!first) return;
    setHostKeys(rest);
    first.resolve(accept);
  }

  async function forgetHostKey() {
    if (!changed) return;
    setForgetting(true);
    try {
      const res = await fetch(`/machine/terminal/${machine.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "forget-hostkey" }),
      });
      if (!res.ok) throw new Error();
      const tab = changed.tab;
      setChanged(null);
      reconnect(tab);
    } catch {
      fail("The saved host key could not be removed.");
    } finally {
      setForgetting(false);
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      root.current?.requestFullscreen().catch(() => fail("Fullscreen is not available."));
    }
  }

  const openNames = tabs.map((tab) => tab.session);
  const closingTab = tabs.find((tab) => tab.id === closing) ?? null;
  const hostKeyAsk = hostKeys[0] ?? null;
  const promptAsk = hostKeyAsk ? null : (prompts[0] ?? null);

  return (
    <div ref={root} className="flex h-full min-h-0 flex-col bg-ctp-mantle">
      <div className="flex h-10 shrink-0 items-stretch border-b border-ui-border bg-ui-surface">
        <div role="tablist" aria-label="Sessions" className="flex min-w-0 items-stretch overflow-x-auto">
          {tabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              active={tab.id === active}
              onSelect={() => select(tab.id)}
              onClose={() => askClose(tab.id)}
            />
          ))}
        </div>

        <div ref={menuRef} className="relative flex items-center px-1">
          <button
            type="button"
            onClick={() => {
              if (!menu) setRecent(recentSessions(machine));
              setMenu(!menu);
            }}
            aria-label="Sessions"
            aria-expanded={menu}
            aria-haspopup="menu"
            className={iconButtonClass}
          >
            <Icon name="plus" className="size-4" />
          </button>
          {menu && (
            <div
              role="menu"
              className="absolute top-full left-1 z-40 mt-1 w-72 rounded-lg border border-ui-border bg-ui-raised p-1 shadow-lg shadow-black/20 animate-fade-in motion-reduce:animate-none"
            >
              <SessionList
                recent={recent}
                open={openNames}
                onOpen={open}
                onCreate={create}
                onForget={forget}
              />
            </div>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 pr-2 pl-1">
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            className={iconButtonClass}
          >
            <Icon name={fullscreen ? "shrink" : "expand"} className="size-4" />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            aria-label={tab.session}
            className={`absolute inset-0 ${tab.id === active ? "" : "pointer-events-none invisible"}`}
          >
            {tab.opened && (
              <TerminalView
                key={tab.generation}
                active={tab.id === active}
                connect={connectFor(tab)}
                onStatus={(status) => setStatus(tab.id, status)}
                onExit={() => close(tab.id)}
                onTitle={(title) =>
                  updateTab(tab.id, (entry) => (entry.title === title ? entry : { ...entry, title }))
                }
              />
            )}
            {tab.opened && tab.status.phase !== "ready" && (
              <StatusOverlay
                status={tab.status}
                onReconnect={() => reconnect(tab.id)}
                onReview={
                  tab.status.phase === "closed" && tab.status.hostKey
                    ? () => setChanged({ tab: tab.id, key: (tab.status as { hostKey: HostKeyInfo }).hostKey })
                    : undefined
                }
              />
            )}
          </div>
        ))}

        {ready && tabs.length === 0 && (
          <div className="grid h-full place-items-center p-4">
            <div className="w-80 rounded-lg border border-ui-border bg-ui-raised p-1">
              <SessionList
                recent={recent}
                open={openNames}
                onOpen={open}
                onCreate={create}
                onForget={forget}
              />
            </div>
          </div>
        )}
      </div>

      <HostKeyDialog request={hostKeyAsk} machine={machine} onAnswer={answerHostKey} />
      <PromptDialog
        request={promptAsk}
        machine={machine}
        onSubmit={(answers) => answerPrompt(answers)}
        onCancel={() => answerPrompt(null)}
      />
      <HostKeyChangedDialog
        hostKey={changed?.key ?? null}
        machine={machine}
        busy={forgetting}
        onForget={() => void forgetHostKey()}
        onClose={() => setChanged(null)}
      />
      <Dialog open={closingTab !== null} title="Close this tab?" onClose={() => setClosing(null)}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ui-fg-muted">
            <span className="font-mono text-ui-fg">{closingTab?.session}</span> keeps running on{" "}
            {machine.name}. You can open it again later.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" autoFocus onClick={() => setClosing(null)} className={buttonClass}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (closingTab) close(closingTab.id);
                setClosing(null);
              }}
              className={dangerButtonClass}
            >
              Close tab
            </button>
          </div>
        </div>
      </Dialog>
      <Toast key={failure.attempt} message={failure.attempt > 0 ? failure.message : null} />
    </div>
  );
}

function StatusOverlay({
  status,
  onReconnect,
  onReview,
}: {
  status: LinkStatus;
  onReconnect: () => void;
  onReview?: () => void;
}) {
  const closed = status.phase === "closed";
  const label =
    status.phase === "connecting"
      ? "Connecting…"
      : status.phase === "login"
        ? "Waiting for login…"
        : status.phase === "closed"
          ? (status.error ?? "Disconnected.")
          : "";

  return (
    <div className="absolute inset-0 grid place-items-center bg-[color-mix(in_oklab,var(--ctp-mantle)_82%,transparent)] p-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <span
          className={`grid size-10 place-items-center rounded-full border ${
            closed
              ? "border-[color-mix(in_oklab,var(--ui-danger)_45%,transparent)] text-ui-danger"
              : "border-ui-border text-[var(--accent)]"
          }`}
        >
          <Icon name={closed ? "alert" : "security"} className={`size-5 ${closed ? "" : "animate-pulse motion-reduce:animate-none"}`} />
        </span>
        <p className="text-sm text-ui-fg">{label}</p>
        {closed && (
          <div className="flex flex-wrap justify-center gap-2">
            {onReview && (
              <button type="button" onClick={onReview} className={buttonClass}>
                Review host key
              </button>
            )}
            <button type="button" onClick={onReconnect} className={buttonClass}>
              Reconnect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

type TabItemProps = {
  tab: Tab;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
};

function TabItem({ tab, active, onSelect, onClose }: TabItemProps) {
  return (
    <div
      className={`group relative flex shrink-0 items-center border-r border-ui-border-soft transition-colors motion-reduce:transition-none ${
        active
          ? "-mb-px bg-ctp-mantle text-ui-fg shadow-[inset_0_2px_0_var(--accent)]"
          : "text-ui-fg-muted hover:bg-ui-hover hover:text-ui-fg"
      }`}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        title={tab.title ? `${tab.session} · ${tab.title}` : tab.session}
        onClick={onSelect}
        onAuxClick={(event) => {
          if (event.button === 1) onClose();
        }}
        className="flex h-full cursor-pointer items-center gap-2 pr-1 pl-3 outline-none focus-visible:ring-2 focus-visible:ring-ui-ring focus-visible:ring-inset"
      >
        <span className={`size-1.5 shrink-0 rounded-full ${statusDot(tab, active)}`} />
        <span className="max-w-40 truncate font-mono text-[13px]">{tab.session}</span>
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close ${tab.session}`}
        title="Detach"
        className={`mr-1.5 grid size-6 cursor-pointer place-items-center rounded text-ui-fg-faint outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ui-ring ${
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <Icon name="close" className="size-3.5" />
      </button>
    </div>
  );
}
