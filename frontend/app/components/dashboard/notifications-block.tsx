import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Badge } from "../block";
import { Icon } from "../icons";
import { accentVars } from "../../lib/nav";
import { writeSeen, type GradeNotice } from "../../lib/dashboard";

export type MailSummary = {
  connected: boolean;
  unread: number | null;
};

export type GradeSummary = {
  fresh: GradeNotice[];
  keys: string[];
  baseline: boolean;
};

type NotificationsBlockProps = {
  mail: MailSummary;
  grades: GradeSummary;
};

const shownGrades = 5;

export function NotificationsBlock({ mail, grades }: NotificationsBlockProps) {
  const [cleared, setCleared] = useState<string[]>([]);
  const fresh = grades.fresh.filter((notice) => !cleared.includes(notice.key));

  useEffect(() => {
    if (grades.baseline && grades.keys.length > 0) writeSeen(grades.keys);
  }, [grades.baseline, grades.keys.join(".")]);

  function markRead() {
    writeSeen(grades.keys);
    setCleared(grades.fresh.map((notice) => notice.key));
  }

  return (
    <section className="overflow-hidden rounded-xl border border-ui-border bg-ui-raised">
      <header className="flex h-10 items-center gap-2.5 border-b border-ui-border-soft bg-ui-surface px-4">
        <h2 className="text-sm font-semibold text-ui-fg">Notifications</h2>
        {fresh.length > 0 && <Badge tone="accent">{fresh.length} new</Badge>}
        {fresh.length > 0 && (
          <button
            type="button"
            onClick={markRead}
            className="ml-auto rounded-md px-1.5 text-xs text-ui-fg-muted outline-none hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
          >
            Mark all read
          </button>
        )}
      </header>

      <div className="flex flex-col gap-2 p-4">
        <MailRow mail={mail} />

        {fresh.slice(0, shownGrades).map((notice) => (
          <Link
            key={notice.key}
            to="/grades"
            onClick={markRead}
            style={accentVars("yellow")}
            className="flex items-center gap-3 rounded-lg border border-ui-border-soft bg-ui-surface p-3 outline-none hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent)]">
              <Icon name="grades" className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium tracking-wide text-[var(--accent-fg)] uppercase">
                {notice.graded ? "New grade" : "New result"}
              </span>
              <span className="block truncate text-sm text-ui-fg">{notice.name}</span>
            </span>
            <Icon name="chevron" className="size-4 shrink-0 text-ui-fg-faint" />
          </Link>
        ))}

        {fresh.length > shownGrades && (
          <Link to="/grades" onClick={markRead} className="px-1 text-xs text-ui-fg-muted hover:text-ui-fg">
            +{fresh.length - shownGrades} more new grades
          </Link>
        )}

        {fresh.length === 0 && <p className="px-1 pt-1 text-xs text-ui-fg-faint">No other notifications.</p>}
      </div>
    </section>
  );
}

function MailRow({ mail }: { mail: MailSummary }) {
  const unread = mail.unread ?? 0;
  const active = mail.connected && unread > 0;

  return (
    <Link
      to={mail.connected ? "/mail" : "/settings/connections"}
      style={accentVars("teal")}
      className={`flex items-center gap-3 rounded-lg border p-3 outline-none hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring ${
        active
          ? "border-[color-mix(in_oklab,var(--accent)_55%,transparent)] bg-[color-mix(in_oklab,var(--accent)_8%,var(--ui-surface))]"
          : "border-ui-border-soft bg-ui-surface"
      }`}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent)]">
        <Icon name="mail" className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ui-fg">Emails</span>
        <span className="block truncate text-xs text-ui-fg-muted">
          {!mail.connected
            ? "Not connected"
            : mail.unread === null
              ? "Not reachable right now"
              : unread === 1
                ? "1 new email in your inbox"
                : `${unread} new in your inbox`}
        </span>
      </span>
      {mail.connected && (
        <span
          className={`text-3xl font-semibold tabular-nums ${active ? "text-[var(--accent-fg)]" : "text-ui-fg-faint"}`}
        >
          {mail.unread === null ? "–" : unread}
        </span>
      )}
    </Link>
  );
}
