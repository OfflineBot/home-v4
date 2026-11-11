import { useTicker } from "./use-ticker";
import { eventAccent } from "../../lib/nav";
import {
  clockTime,
  fullDate,
  remaining,
  seconds,
  until,
  weekdayName,
  type DayPlan,
} from "../../lib/dashboard";

type ClockCardProps = {
  initial: number;
  now: number;
  plan: DayPlan;
  calendarFailed: boolean;
};

export function ClockCard({ initial, now, plan, calendarFailed }: ClockCardProps) {
  const time = useTicker(initial, 1000);

  return (
    <section className="relative overflow-hidden rounded-xl border border-ui-border bg-ui-raised">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,color-mix(in_oklab,var(--accent)_16%,transparent),transparent_65%)]"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-5 p-5 sm:p-6">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--accent-fg)]">{weekdayName(time)}</p>
          <p className="text-sm text-ui-fg-muted">{fullDate(time)}</p>
          <p
            className="mt-3 flex items-baseline font-semibold tracking-tight text-ui-fg tabular-nums"
            aria-label={`Time ${clockTime(time)}`}
          >
            <span className="text-6xl sm:text-7xl">{clockTime(time)}</span>
            <span className="ml-1.5 text-2xl text-ui-fg-faint sm:text-3xl">{seconds(time)}</span>
          </p>
        </div>

        <Glance plan={plan} now={now} calendarFailed={calendarFailed} />
      </div>
    </section>
  );
}

function Glance({ plan, now, calendarFailed }: { plan: DayPlan; now: number; calendarFailed: boolean }) {
  if (calendarFailed) {
    return <GlanceBox label="Calendar" title="Not reachable right now" />;
  }

  if (plan.current) {
    return (
      <GlanceBox
        label="Now"
        title={plan.current.title}
        detail={`until ${clockTime(plan.current.end)} · ${remaining(plan.current.end, now)}`}
        color={plan.current.color}
        online={plan.current.online}
      />
    );
  }

  if (plan.nextToday) {
    return (
      <GlanceBox
        label="Next"
        title={plan.nextToday.title}
        detail={`${clockTime(plan.nextToday.start)} · ${until(plan.nextToday.start, now)}`}
        color={plan.nextToday.color}
        online={plan.nextToday.online}
      />
    );
  }

  return (
    <GlanceBox
      label="Today"
      title={plan.today.length > 0 ? "Free for the rest of the day" : "Nothing planned"}
    />
  );
}

type GlanceBoxProps = {
  label: string;
  title: string;
  detail?: string;
  color?: string;
  online?: boolean;
};

function GlanceBox({ label, title, detail, color, online }: GlanceBoxProps) {
  return (
    <div
      style={color ? eventAccent(color, online) : undefined}
      className="flex w-full min-w-0 items-stretch gap-3 rounded-lg border border-ui-border-soft bg-ui-surface/70 p-3 sm:w-auto sm:max-w-sm"
    >
      <span className={`w-1 shrink-0 rounded-full ${color ? "bg-[var(--accent)]" : "bg-ui-border"}`} />
      <span className="min-w-0">
        <span className="block text-xs font-medium tracking-wide text-ui-fg-muted uppercase">{label}</span>
        <span className="block truncate text-sm font-semibold text-ui-fg">{title}</span>
        {detail && <span className="block text-xs text-ui-fg-muted tabular-nums">{detail}</span>}
      </span>
    </div>
  );
}
