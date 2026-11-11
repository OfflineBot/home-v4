import type { ReactNode } from "react";
import { Link } from "react-router";
import { DayTimeline } from "./day-timeline";
import {
  AverageTile,
  LightsTile,
  MailTile,
  NoticesTile,
  type AverageSummary,
  type MailSummary,
  type NoticeSummary,
} from "./tiles";
import { calendarHref, parseDay } from "../../lib/calendar";
import { accentVars, eventAccent } from "../../lib/nav";
import {
  clockTime,
  dayLabel,
  fullDate,
  progress,
  remaining,
  until,
  weekdayName,
  type AgendaItem,
  type DayPlan,
} from "../../lib/dashboard";
import type { Light } from "../../lib/light";

type ClockCardProps = {
  now: number;
  plan: DayPlan;
  calendarFailed: boolean;
  average: AverageSummary;
  mail: MailSummary;
  notices: NoticeSummary;
  lights: Light[];
};

type Period = { name: string; colors: [string, string, string] };

const periods: { from: number; period: Period }[] = [
  { from: 0, period: { name: "night", colors: ["lavender", "blue", "mauve"] } },
  { from: 5, period: { name: "morning", colors: ["peach", "yellow", "rosewater"] } },
  { from: 11, period: { name: "day", colors: ["sky", "blue", "teal"] } },
  { from: 17, period: { name: "evening", colors: ["mauve", "pink", "peach"] } },
  { from: 21, period: { name: "night", colors: ["lavender", "blue", "mauve"] } },
];

function periodAt(ms: number) {
  const hour = Number(clockTime(ms).slice(0, 2));
  return [...periods].reverse().find((entry) => hour >= entry.from)!.period;
}

function dayHref(day: string) {
  const date = parseDay(day);
  return `/calendar${calendarHref("week", date ?? undefined)}`;
}

const pressable =
  "rounded-xl outline-none transition-colors hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none";

export function ClockCard({ now, plan, calendarFailed, average, mail, notices, lights }: ClockCardProps) {
  const period = periodAt(now);
  const focus = calendarFailed ? null : plan.focus;
  const focusLabel = focus && !focus.isToday && focus.items[0] ? dayLabel(focus.items[0].start, now) : null;

  return (
    <div style={accentVars(period.colors[0])} className="flex flex-col gap-8 p-2 sm:p-6">
      <div className={`grid items-end gap-6 lg:gap-8 ${focus ? "lg:grid-cols-[minmax(0,1fr)_24rem]" : ""}`}>
        <Link to={dayHref("")} className={`-m-3 min-w-0 p-3 ${pressable}`}>
          <span className="block text-lg font-semibold text-[var(--accent-fg)]">{weekdayName(now)}</span>
          <span className="block text-sm text-ui-fg-muted">{fullDate(now)}</span>
          <span
            className="mt-4 block text-8xl leading-none font-medium tracking-tighter text-ui-fg tabular-nums sm:text-9xl xl:text-[11rem]"
            aria-label={`Time ${clockTime(now)}`}
          >
            {clockTime(now)}
          </span>
          {calendarFailed && <span className="mt-3 block text-sm text-ui-danger">Calendar not reachable</span>}
        </Link>
        {focus && <Glance plan={plan} now={now} focusLabel={focusLabel} href={dayHref(focus.day)} />}
      </div>

      {focus && (
        <Link to={dayHref(focus.day)} className={`-mx-3 -my-2 flex flex-col gap-2 px-3 py-2 ${pressable}`}>
          {focusLabel && <span className="text-sm font-medium text-[var(--accent-fg)]">{focusLabel}</span>}
          <DayTimeline items={focus.items} now={now} day={focus.day} showNow={focus.isToday} />
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:auto-cols-fr xl:grid-flow-col xl:grid-cols-none">
        <AverageTile average={average} />
        <MailTile mail={mail} />
        <LightsTile lights={lights} />
        <NoticesTile notices={notices} />
      </div>
    </div>
  );
}

function Glance({ plan, now, focusLabel, href }: { plan: DayPlan; now: number; focusLabel: string | null; href: string }) {
  if (plan.current) {
    const item = plan.current;
    return (
      <EventBox item={item} label="Now" href={href}>
        <span className="flex items-center gap-3">
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--accent)_20%,transparent)]" aria-hidden>
            <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.round(progress(item, now) * 100)}%` }} />
          </span>
          <span className="text-sm font-semibold text-[var(--accent-fg)] tabular-nums">{remaining(item.end, now).replace(" left", "")}</span>
        </span>
        <span className="text-xs text-ui-fg-muted tabular-nums">until {clockTime(item.end)}</span>
      </EventBox>
    );
  }

  const item = plan.focus?.isToday ? plan.nextToday : (plan.focus?.items.find((entry) => !entry.cancelled) ?? null);
  if (!item) return null;

  return (
    <EventBox item={item} label={focusLabel ?? "Next"} href={href}>
      <span className="flex items-baseline gap-3">
        <span className="text-2xl font-semibold text-ui-fg tabular-nums">{clockTime(item.start)}</span>
        {!focusLabel && <span className="text-sm font-semibold text-[var(--accent-fg)]">{until(item.start, now)}</span>}
        {item.room && <span className="ml-auto truncate text-xs text-ui-fg-muted">{item.room}</span>}
      </span>
    </EventBox>
  );
}

function EventBox({ item, label, href, children }: { item: AgendaItem; label: string; href: string; children: ReactNode }) {
  return (
    <Link
      to={href}
      style={eventAccent(item.color, item.online)}
      className="flex w-full min-w-0 gap-3 rounded-xl border border-ui-border bg-ui-raised p-4 outline-none transition-colors hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none"
    >
      <span className="w-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="min-w-0">
          <span className="block text-xs text-ui-fg-muted">{label}</span>
          <span className="block truncate text-lg font-semibold text-ui-fg">{item.title}</span>
        </span>
        {children}
      </span>
    </Link>
  );
}
