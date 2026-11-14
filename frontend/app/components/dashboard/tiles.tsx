import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "../icons";
import { buttonClass, primaryButtonClass } from "../setting-row";
import { Toast } from "../toast";
import { accentVars } from "../../lib/nav";
import {
  gradesSeenCookie,
  moodleSeenCookie,
  writeSeen,
  type Notice,
  type SeenSource,
} from "../../lib/dashboard";
import { lightsApi, scenes, type Light, type Scene } from "../../lib/light";

export type MailSummary = { connected: boolean; unread: number | null };
export type NoticeSummary = {
  items: Notice[];
  grades: SeenSource;
  moodle: SeenSource;
};

const frameClass =
  "flex min-h-32 w-full min-w-0 flex-col gap-3 rounded-xl border border-ui-border bg-ui-raised p-4 text-left";

const linkClass =
  "outline-none transition-colors hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none";

function Heading({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-sm font-medium text-ui-fg-muted">{children}</span>
      {aside && (
        <span className="ml-auto flex items-center gap-2">{aside}</span>
      )}
    </span>
  );
}

export function hasUnread(mail: MailSummary) {
  return mail.connected && (mail.unread ?? 0) > 0;
}

export function MailTile({ mail }: { mail: MailSummary }) {
  const unread = mail.unread ?? 0;

  return (
    <Link to="/mail" className={`${frameClass} ${linkClass}`}>
      <Heading>Mail</Heading>
      <span className="flex items-baseline gap-2">
        <span className="text-5xl font-semibold text-ctp-teal tabular-nums">
          {unread}
        </span>
        <span className="text-base text-ui-fg-muted">
          {unread === 1 ? "unread mail" : "unread mails"}
        </span>
      </span>
    </Link>
  );
}

const shownNotices = 3;

export function useSeenBaseline(notices: NoticeSummary) {
  useEffect(() => {
    if (notices.grades.baseline && notices.grades.keys.length > 0)
      writeSeen(notices.grades.keys, gradesSeenCookie);
    if (notices.moodle.baseline && notices.moodle.keys.length > 0)
      writeSeen(notices.moodle.keys, moodleSeenCookie);
  }, [notices.grades.keys.join("."), notices.moodle.keys.join(".")]);
}

export function NoticesTile({ notices }: { notices: NoticeSummary }) {
  const [cleared, setCleared] = useState(false);

  function markSeen(source?: Notice["source"]) {
    if (!source || source === "grades")
      writeSeen(notices.grades.keys, gradesSeenCookie);
    if (!source || source === "moodle")
      writeSeen(notices.moodle.keys, moodleSeenCookie);
  }

  const items = cleared ? [] : notices.items;
  if (items.length === 0) return null;

  return (
    <div className={frameClass}>
      <Heading
        aside={
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
        }
      >
        Notifications
      </Heading>
      <ul className="-mx-2 flex flex-col">
        {items.slice(0, shownNotices).map((notice) => (
          <li key={notice.key}>
            <Link
              to={notice.href}
              onClick={() => markSeen(notice.source)}
              className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${linkClass}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ui-fg">
                  {notice.title}
                </span>
                <span className="block truncate text-xs text-ui-fg-muted">
                  {notice.detail}
                </span>
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
          <li className="px-2 pt-1 text-xs text-ui-fg-faint">
            +{items.length - shownNotices}
          </li>
        )}
      </ul>
    </div>
  );
}

const refreshMs = 60_000;

// Everything, then the two halves: "all lights off" and "no LED only" read
// alike but do opposite things, so a rule keeps them apart.
const sceneGroups: Scene[][] = [
  ["all", "off"],
  ["led", "no_led"],
];

export function LightsTile({ lights }: { lights: Light[] }) {
  const [busy, setBusy] = useState<Scene | null>(null);
  const [active, setActive] = useState<Scene | null>(null);
  const [failure, setFailure] = useState({ attempt: 0, message: "" });

  const empty = lights.length === 0;

  // marks the scene the room is actually in, read back from the devices
  useEffect(() => {
    if (empty) return;
    let live = true;
    lightsApi.sceneStatus().then((status) => {
      if (live) setActive(status?.scene ? status.scene : null);
    });
    return () => {
      live = false;
    };
  }, [empty]);

  if (empty) return null;

  async function run(scene: Scene) {
    setBusy(scene);
    try {
      const result = await lightsApi.scene(scene);
      if (result.failed.length > 0) {
        setFailure((prev) => ({
          attempt: prev.attempt + 1,
          message:
            result.failed.length === 1
              ? "One light did not answer."
              : `${result.failed.length} lights did not answer.`,
        }));
      }
    } catch {
      setFailure((prev) => ({
        attempt: prev.attempt + 1,
        message: "The lights could not be reached.",
      }));
    } finally {
      setBusy(null);
      const status = await lightsApi.sceneStatus();
      setActive(status?.scene ? status.scene : null);
    }
  }

  return (
    <>
      <div className={frameClass}>
        <Link to="/lights" className={`-m-2 rounded-lg p-2 ${linkClass}`}>
          <Heading>Lights</Heading>
        </Link>
        <span className="mt-auto flex flex-col gap-2.5">
          {sceneGroups.map((group, index) => (
            <span key={group.join()} className="flex flex-col gap-2.5">
              {index > 0 && (
                <span className="h-px bg-ui-border-soft" aria-hidden />
              )}
              <span className="grid grid-cols-2 gap-2">
                {group.map((value) => {
                  const scene = scenes.find((entry) => entry.value === value);
                  if (!scene) return null;

                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={busy !== null}
                      aria-pressed={active === value}
                      onClick={() => run(value)}
                      className={`${
                        active === value ? primaryButtonClass : buttonClass
                      } inline-flex h-12! items-center justify-center gap-2 text-sm`}
                    >
                      <Icon
                        name={value === "off" ? "power" : "lights"}
                        className="size-5"
                      />
                      {scene.label}
                    </button>
                  );
                })}
              </span>
            </span>
          ))}
        </span>
      </div>
      <Toast
        key={failure.attempt}
        message={failure.attempt > 0 ? failure.message : null}
      />
    </>
  );
}
