import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import type { LinkStatus, TerminalLink, TerminalSize } from "../../lib/terminal";
import {
  loadTerminalFont,
  terminalFontFamily,
  terminalTheme,
} from "../../lib/terminal-theme";

const fontSize = 14;

export type TerminalSink = {
  data: (data: Uint8Array | string) => void;
  status: (status: LinkStatus) => void;
  exit: (code: number | null) => void;
};

type TerminalViewProps = {
  connect: (size: TerminalSize, sink: TerminalSink) => TerminalLink;
  active: boolean;
  onStatus: (status: LinkStatus) => void;
  onExit: (code: number | null) => void;
  onTitle: (title: string) => void;
};

type Controls = {
  activate: (active: boolean) => void;
};

function copyText(text: string) {
  if (!text) return;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    return;
  }
  fallbackCopy(text);
}

function fallbackCopy(text: string) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
  } finally {
    area.remove();
  }
}

const writeOnlyClipboard = {
  readText: () => "",
  writeText: (_selection: string, text: string) => copyText(text),
};

export function TerminalView({
  connect,
  active,
  onStatus,
  onExit,
  onTitle,
}: TerminalViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const controls = useRef<Controls | null>(null);
  const activeRef = useRef(active);
  const callbacks = useRef({ connect, onStatus, onExit, onTitle });

  useEffect(() => {
    callbacks.current = { connect, onStatus, onExit, onTitle };
  });

  useEffect(() => {
    activeRef.current = active;
    controls.current?.activate(active);
  }, [active]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    let disposed = false;
    let cleanup = () => {};

    void (async () => {
      const [
        { Terminal },
        { FitAddon },
        { WebLinksAddon },
        { ClipboardAddon },
        { Unicode11Addon },
      ] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-web-links"),
        import("@xterm/addon-clipboard"),
        import("@xterm/addon-unicode11"),
      ]);
      await loadTerminalFont(fontSize);
      if (disposed) return;

      const term = new Terminal({
        allowProposedApi: true,
        cursorBlink: true,
        cursorStyle: "block",
        cursorInactiveStyle: "outline",
        fontFamily: terminalFontFamily,
        fontSize,
        lineHeight: 1.15,
        scrollback: 10_000,
        fastScrollSensitivity: 5,
        macOptionIsMeta: true,
        rescaleOverlappingGlyphs: true,
        theme: terminalTheme(),
      });
      const fit = new FitAddon();
      const unicode = new Unicode11Addon();
      term.loadAddon(fit);
      term.loadAddon(unicode);
      term.loadAddon(new WebLinksAddon());
      term.loadAddon(new ClipboardAddon(undefined, writeOnlyClipboard));
      term.unicode.activeVersion = "11";

      term.attachCustomKeyEventHandler((event) => {
        if (event.type !== "keydown" || !event.ctrlKey || event.altKey || event.metaKey) {
          return true;
        }
        const key = event.key.toLowerCase();
        if (key === "c" && (event.shiftKey || term.hasSelection())) {
          event.preventDefault();
          copyText(term.getSelection());
          if (!event.shiftKey) term.clearSelection();
          return false;
        }
        if (key === "v") return false;
        return true;
      });

      term.open(element);
      fit.fit();

      let webgl: { dispose: () => void } | null = null;
      let webglPending = false;

      async function enableWebgl() {
        if (webgl || webglPending) return;
        webglPending = true;
        try {
          const { WebglAddon } = await import("@xterm/addon-webgl");
          if (disposed || !activeRef.current) return;
          const addon = new WebglAddon();
          addon.onContextLoss(() => {
            addon.dispose();
            webgl = null;
          });
          term.loadAddon(addon);
          webgl = addon;
        } catch {
          webgl = null;
        } finally {
          webglPending = false;
        }
      }

      function disableWebgl() {
        webgl?.dispose();
        webgl = null;
      }

      const link = callbacks.current.connect(
        { cols: term.cols, rows: term.rows },
        {
          data: (data) => term.write(data),
          status: (status) => callbacks.current.onStatus(status),
          exit: (code) => callbacks.current.onExit(code),
        },
      );
      const subscriptions = [
        term.onData((data) => link.send(data)),
        term.onBinary((data) => link.sendBinary(data)),
        term.onResize((size) => link.resize(size)),
        term.onTitleChange((title) => callbacks.current.onTitle(title)),
      ];

      let frame = 0;
      const resizer = new ResizeObserver(() => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (element.clientWidth > 0 && element.clientHeight > 0) fit.fit();
        });
      });
      resizer.observe(element);

      const themer = new MutationObserver(() => {
        term.options.theme = terminalTheme();
      });
      themer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });

      controls.current = {
        activate(next) {
          if (next) {
            void enableWebgl();
            fit.fit();
            term.focus();
          } else {
            disableWebgl();
          }
        },
      };
      controls.current.activate(activeRef.current);

      cleanup = () => {
        controls.current = null;
        cancelAnimationFrame(frame);
        resizer.disconnect();
        themer.disconnect();
        for (const subscription of subscriptions) subscription.dispose();
        link.close();
        disableWebgl();
        term.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <div
      ref={host}
      className="size-full overflow-hidden [&_.xterm]:size-full [&_.xterm]:py-2 [&_.xterm]:pl-3"
      onMouseDown={() => controls.current?.activate(true)}
    />
  );
}
