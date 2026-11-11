import { useState, type ReactNode } from "react";
import type { IconInfo } from "../../lib/automation";

type NodeIconProps = {
  info: IconInfo | null | undefined;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: { box: "size-7", img: "size-4", text: "text-[10px]" },
  md: { box: "size-9", img: "size-5", text: "text-xs" },
  lg: { box: "size-11", img: "size-6", text: "text-sm" },
};

const glyphs: Record<string, ReactNode> = {
  webhook: (
    <>
      <circle cx="12" cy="6.5" r="2.5" />
      <circle cx="6.5" cy="17" r="2.5" />
      <circle cx="17.5" cy="17" r="2.5" />
      <path d="M10.8 8.7 7.7 14.8M13.2 8.7l3.1 6.1M9 17h6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  branch: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M6 8v8M8 6.5c5 0 4 5.5 8 5.5" />
    </>
  ),
  filter: <path d="M4 5.5h16l-6.25 7.25v5.5l-3.5 1.75v-7.25L4 5.5Z" />,
  pen: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  hourglass: (
    <path d="M7 3.5h10M7 20.5h10M8 3.5c0 4 8 5 8 8.5s-8 4.5-8 8.5M16 3.5c0 4-8 5-8 8.5s8 4.5 8 8.5" />
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7.5 8.5 5.5 8.5-5.5" />
    </>
  ),
  rss: <path d="M5 19h.01M5 12a7 7 0 0 1 7 7M5 5a14 14 0 0 1 14 14" />,
  code: <path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5Z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 11h18" />
    </>
  ),
  list: <path d="M8 6.5h11M8 12h11M8 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  reply: <path d="M9.5 14.5 4.5 9.5l5-5M4.5 9.5h9a6 6 0 0 1 6 6v3" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v5M12 16.5v.01" />
    </>
  ),
  circle: <circle cx="12" cy="12" r="6.5" />,
  document: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5M9 13h6M9 16.5h4" />
    </>
  ),
  chat: <path d="M5 18.5V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8.5L5 18.5Z" />,
  key: (
    <>
      <circle cx="8" cy="15" r="3.5" />
      <path d="m10.5 12.5 8-8M16 7l2.5 2.5M14 9l2 2" />
    </>
  ),
  form: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m20.5 16-5-5-8 8" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </>
  ),
  play: <path d="M8 5.5v13l10-6.5-10-6.5Z" />,
  terminal: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="m7 9.5 3 2.5-3 2.5M12.5 15h4" />
    </>
  ),
  bolt: <path d="M14 2 5 14h6l-1 8 9-12h-6l1-8Z" />,
};

const aliases: [RegExp, string][] = [
  [/webhook$|sse-trigger/, "webhook"],
  [/respond-to-webhook/, "reply"],
  [/schedule|clock|cron|interval/, "clock"],
  [/hourglass|wait/, "hourglass"],
  [/(^|:)if$|switch|merge|compare/, "branch"],
  [/filter|remove-duplicates|limit/, "filter"],
  [/edit-fields|rename-keys|pen/, "pen"],
  [/send-mail|inbox|email/, "mail"],
  [/rss/, "rss"],
  [/code|transform|function/, "code"],
  [/http-request|globe|network/, "globe"],
  [/date-and-time|calendar/, "calendar"],
  [/aggregate|summarize|split|sort|loop|item-list|table/, "list"],
  [/stop-and-error|error-trigger|guardrails/, "alert"],
  [/no-operation/, "circle"],
  [/html|xml|markdown|file|pdf|extract|convert|compression/, "document"],
  [/chat|agent|llm|chain|comments|robot|classifier|sentiment|memory|think/, "chat"],
  [/totp|key|crypto/, "key"],
  [/form/, "form"],
  [/image/, "image"],
  [/data-table|database|vector|retriever/, "database"],
  [/manual-trigger|play|execute|workflow|sub-workflow/, "play"],
  [/ssh|ftp|terminal/, "terminal"],
];

const colors: Record<string, string> = {
  black: "overlay2",
  neutral: "overlay2",
  green: "green",
  "light-green": "green",
  "forest-green": "green",
  "dark-green": "green",
  lime: "green",
  "orange-red": "peach",
  orange: "peach",
  primary: "peach",
  amber: "yellow",
  rust: "maroon",
  blue: "blue",
  "dark-blue": "blue",
  azure: "sapphire",
  "light-blue": "sky",
  teal: "teal",
  violet: "mauve",
  purple: "mauve",
  crimson: "red",
  red: "red",
  magenta: "pink",
  pink: "pink",
};

function glyphFor(icon: string | null | undefined) {
  if (!icon) return null;
  const name = icon.toLowerCase();
  const match = aliases.find(([pattern]) => pattern.test(name));
  return match ? glyphs[match[1]] : null;
}

export function NodeIcon({ info, size = "md" }: NodeIconProps) {
  const [broken, setBroken] = useState(false);
  const style = sizes[size];
  const glyph = glyphFor(info?.icon);
  const letter = info?.label?.trim().charAt(0).toUpperCase() || "";
  const tone = colors[info?.color ?? ""];
  const color = tone ? `var(--ctp-${tone})` : "var(--accent)";

  return (
    <span
      className={`grid ${style.box} shrink-0 place-items-center rounded-lg border border-ui-border-soft bg-ui-surface`}
      title={info?.label}
      style={{ color }}
    >
      {info?.url && !broken ? (
        <img
          src={info.url}
          alt=""
          loading="lazy"
          className={`${style.img} object-contain`}
          onError={() => setBroken(true)}
        />
      ) : glyph || !letter ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={style.img}
        >
          {glyph ?? glyphs.bolt}
        </svg>
      ) : (
        <span className={`${style.text} font-semibold`}>{letter}</span>
      )}
    </span>
  );
}

export function NodeChain({ icons }: { icons: (IconInfo | null)[] }) {
  if (icons.length === 0) {
    return <span className="text-xs text-ui-fg-faint">No steps yet</span>;
  }

  const shown = icons.slice(0, 6);

  return (
    <span className="flex items-center gap-1">
      {shown.map((info, index) => (
        <span key={index} className="flex items-center gap-1">
          {index > 0 && <span className="h-px w-2 bg-ui-border" aria-hidden />}
          <NodeIcon info={info} size="sm" />
        </span>
      ))}
      {icons.length > shown.length && (
        <span className="pl-1 text-xs text-ui-fg-muted">+{icons.length - shown.length}</span>
      )}
    </span>
  );
}
