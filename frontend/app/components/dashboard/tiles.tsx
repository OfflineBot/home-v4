import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "../icons";
import { buttonClass, primaryButtonClass } from "../setting-row";
import { Toast } from "../toast";
import { accentVars } from "../../lib/nav";
import {
  gradeColor,
  gradesSeenCookie,
  moodleSeenCookie,
  writeSeen,
  type Notice,
  type SeenSource,
} from "../../lib/dashboard";
import { formatAverage } from "../../lib/grades";
import { lightsApi, type Light, type LightState } from "../../lib/light";

export type MailSummary = { connected: boolean; unread: number | null };
export type AverageSummary = { connected: boolean; value: number | null; count: number };
export type NoticeSummary = { items: Notice[]; grades: SeenSource; moodle: SeenSource };

const frameClass = "flex min-h-32 w-full min-w-0 flex-col gap-3 rounded-xl border border-ui-border bg-ui-raised p-4 text-left";

const linkClass =
  "outline-none transition-colors hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none";

function Heading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-sm font-medium text-ui-fg-muted">{children}</span>
      {aside && <span className="ml-auto flex items-center gap-2">{aside}</span>}
    </span>
  );
}

export function AverageTile({ average }: { average: AverageSummary }) {
  const value = average.value;

  return (
    <Link
      to={average.connected ? "/grades" : "/settings/connections"}
      className={`${frameClass} ${linkClass}`}
      title={average.connected ? `${average.count} graded modules` : "Dualis not connected"}
    >
      <Heading>Grades</Heading>
      <span
        style={accentVars(gradeColor(value))}
        className={`text-5xl font-semibold tabular-nums ${value === null ? "text-ui-fg-faint" : "text-[var(--accent-fg)]"}`}
      >
        {value === null ? "–" : formatAverage(value)}
      </span>
    </Link>
  );
}

export function MailTile({ mail }: { mail: MailSummary }) {
  const unread = mail.unread ?? 0;
  const known = mail.connected && mail.unread !== null;

  return (
    <Link to={mail.connected ? "/mail" : "/settings/connections"} className={`${frameClass} ${linkClass}`}>
      <Heading>Mail</Heading>
      {known ? (
        <span className="flex items-baseline gap-2">
          <span className={`text-5xl font-semibold tabular-nums ${unread > 0 ? "text-ctp-teal" : "text-ui-fg"}`}>
            {unread}
          </span>
          <span className="text-base text-ui-fg-muted">unread mail{unread === 1 ? "" : "s"}</span>
        </span>
      ) : (
        <span className="text-base text-ui-fg-faint">{mail.connected ? "Not reachable" : "Not connected"}</span>
      )}
    </Link>
  );
}

const shownNotices = 3;

export function NoticesTile({ notices }: { notices: NoticeSummary }) {
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    if (notices.grades.baseline && notices.grades.keys.length > 0) writeSeen(notices.grades.keys, gradesSeenCookie);
    if (notices.moodle.baseline && notices.moodle.keys.length > 0) writeSeen(notices.moodle.keys, moodleSeenCookie);
  }, [notices.grades.keys.join("."), notices.moodle.keys.join(".")]);

  function markSeen(source?: Notice["source"]) {
    if (!source || source === "grades") writeSeen(notices.grades.keys, gradesSeenCookie);
    if (!source || source === "moodle") writeSeen(notices.moodle.keys, moodleSeenCookie);
  }

  const items = cleared ? [] : notices.items;

  return (
    <div className={frameClass}>
      <Heading
        aside={
          items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                markSeen();
                setCleared(true);
              }}
              aria-label="Clear notifications"
              title="Clear"
              className="grid size-6 cursor-pointer place-items-center rounded text-ui-fg-faint outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
            >
              <Icon name="close" className="size-3.5" />
            </button>
          )
        }
      >
        Notifications
      </Heading>
      {items.length > 0 && (
        <ul className="-mx-2 flex flex-col">
          {items.slice(0, shownNotices).map((notice) => (
            <li key={notice.key}>
              <Link
                to={notice.href}
                onClick={() => markSeen(notice.source)}
                className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${linkClass}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ui-fg">{notice.title}</span>
                  <span className="block truncate text-xs text-ui-fg-muted">{notice.detail}</span>
                </span>
                <span
                  style={accentVars(notice.color)}
                  className="shrink-0 rounded-md bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] px-2 py-0.5 text-sm font-bold text-[var(--accent-fg)] tabular-nums"
                >
                  {notice.value}
                </span>
              </Link>
            </li>
          ))}
          {items.length > shownNotices && (
            <li className="px-2 pt-1 text-xs text-ui-fg-faint">+{items.length - shownNotices}</li>
          )}
        </ul>
      )}
    </div>
  );
}

type Entry = LightState | "loading" | "error";

const refreshMs = 60_000;

export function LightsTile({ lights }: { lights: Light[] }) {
  const shown = lights;
  const [states, setStates] = useState<Record<number, Entry>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState({ message: "", attempt: 0 });
  const ids = shown.map((light) => light.id).join(",");

  const load = useCallback(() => {
    for (const light of shown) {
      lightsApi.state(light.id).then(
        (state) => setStates((current) => ({ ...current, [light.id]: state })),
        () => setStates((current) => ({ ...current, [light.id]: "error" })),
      );
    }
  }, [ids]);

  useEffect(() => {
    load();
    const refresh = () => {
      if (document.visibilityState === "visible") load();
    };
    const id = setInterval(refresh, refreshMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const known = shown.filter((light) => typeof states[light.id] === "object");
  const anyOn = known.some((light) => (states[light.id] as LightState).on);

  async function switchAll(on: boolean) {
    const before = states;
    setBusy(true);
    setStates((current) => {
      const next = { ...current };
      for (const light of known) next[light.id] = { ...(current[light.id] as LightState), on };
      return next;
    });

    const results = await Promise.allSettled(known.map((light) => lightsApi.apply(light.id, { on })));
    const failed: string[] = [];
    results.forEach((result, index) => {
      const light = known[index];
      if (result.status === "fulfilled") {
        setStates((current) => ({ ...current, [light.id]: result.value }));
      } else {
        failed.push(light.name);
        setStates((current) => ({ ...current, [light.id]: before[light.id] ?? "error" }));
      }
    });
    if (failed.length > 0) {
      setFailure((current) => ({ message: `Could not switch ${failed.join(", ")}.`, attempt: current.attempt + 1 }));
    }
    setBusy(false);
  }

  const blocked = known.length === 0 || busy;
  if (shown.length === 0) return null;

  return (
    <>
      <div className={`${frameClass} ${anyOn ? "border-[color-mix(in_oklab,var(--ctp-pink)_55%,transparent)]" : ""}`}>
        <Link to="/lights" className={`-m-2 flex flex-col gap-3 rounded-lg p-2 ${linkClass}`}>
          <Heading>Lights</Heading>
          <span className="flex flex-wrap items-center gap-2.5">
            {shown.map((light) => {
              const entry = states[light.id];
              const on = typeof entry === "object" && entry.on;
              return (
                <span
                  key={light.id}
                  title={`${light.name} · ${entry === "error" ? "not reachable" : on ? "on" : "off"}`}
                  className={`grid size-9 place-items-center rounded-full transition-[background-color,box-shadow,color] duration-300 motion-reduce:transition-none ${
                    entry === "error"
                      ? "border-2 border-dashed border-ui-danger text-ui-danger"
                      : on
                        ? "bg-ctp-pink text-ui-frame shadow-[0_0_14px_var(--ctp-pink)]"
                        : entry === undefined
                          ? "animate-pulse bg-ui-field text-ui-fg-faint"
                          : "bg-ui-field text-ui-fg-faint"
                  }`}
                >
                  <Icon name="lights" className="size-4.5" />
                </span>
              );
            })}
          </span>
        </Link>
        <span className="mt-auto grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={blocked}
            onClick={() => switchAll(true)}
            className={`${primaryButtonClass} inline-flex h-12! items-center justify-center gap-2 text-base`}
          >
            <Icon name="lights" className="size-5" />
            On
          </button>
          <button
            type="button"
            disabled={blocked}
            onClick={() => switchAll(false)}
            className={`${buttonClass} inline-flex h-12! items-center justify-center gap-2 text-base`}
          >
            <Icon name="power" className="size-5" />
            Off
          </button>
        </span>
      </div>
      <Toast key={failure.attempt} message={failure.attempt > 0 ? failure.message : null} />
    </>
  );
}
