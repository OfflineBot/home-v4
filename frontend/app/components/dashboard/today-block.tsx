import { Link } from "react-router";
import { Badge } from "../block";
import { Icon } from "../icons";
import { eventAccent } from "../../lib/nav";
import {
  agendaDays,
  clockTime,
  dayLabel,
  progress,
  remaining,
  until,
  type AgendaItem,
  type DayPlan,
} from "../../lib/dashboard";

type TodayBlockProps = {
  plan: DayPlan;
  now: number;
  calendarFailed: boolean;
};

export function TodayBlock({ plan, now, calendarFailed }: TodayBlockProps) {
  const { today, next, remainingToday } = plan;
  const done = today.length > 0 && remainingToday === 0;

  return (
    <section className="overflow-hidden rounded-xl border border-ui-border bg-ui-raised">
      <header className="flex h-10 items-center gap-2.5 border-b border-ui-border-soft bg-ui-surface px-4">
        <h2 className="text-sm font-semibold text-ui-fg">Today</h2>
        {today.length > 0 && (
          <Badge tone={remainingToday > 0 ? "accent" : "neutral"}>
            {remainingToday > 0 ? `${remainingToday} left` : "Done"}
          </Badge>
        )}
        <Link
          to="/calendar"
          className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 text-xs text-ui-fg-muted outline-none hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
        >
          Calendar
          <Icon name="chevron" className="size-3.5" />
        </Link>
      </header>

      <div className="p-4">
        {calendarFailed ? (
          <p className="text-sm text-ui-fg-muted">The calendar is not reachable right now.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {today.length === 0 ? (
              <EmptyDay />
            ) : (
              <ol className="flex flex-col gap-2">
                {today.map((item) => (
                  <AgendaRow key={item.id} item={item} now={now} />
                ))}
              </ol>
            )}

            {(today.length === 0 || done) &&
              (next ? (
                <NextUp item={next} now={now} />
              ) : (
                <p className="text-sm text-ui-fg-muted">
                  Nothing in the next {agendaDays} days.
                </p>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyDay() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-ui-border text-ctp-green">
        <Icon name="check" />
      </span>
      <p className="text-sm text-ui-fg-muted">Nothing planned today.</p>
    </div>
  );
}

function AgendaRow({ item, now }: { item: AgendaItem; now: number }) {
  const past = item.end <= now;
  const live = !item.cancelled && item.start <= now && item.end > now;
  const soon = !item.cancelled && !live && item.start > now;
  const meta = [item.room, item.online ? "Online" : "", item.teacher].filter(Boolean);

  return (
    <li
      style={eventAccent(item.color, item.online)}
      className={`relative flex gap-3 overflow-hidden rounded-lg border p-3 transition-opacity motion-reduce:transition-none ${
        live
          ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_9%,var(--ui-surface))]"
          : "border-ui-border-soft bg-ui-surface"
      } ${past && !live ? "opacity-55" : ""}`}
    >
      <span className="w-12 shrink-0 text-right tabular-nums">
        <span className="block text-sm font-semibold text-ui-fg">{clockTime(item.start)}</span>
        <span className="block text-xs text-ui-fg-faint">{clockTime(item.end)}</span>
      </span>

      <span className="w-1 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={`min-w-0 truncate text-sm font-medium text-ui-fg ${item.cancelled ? "line-through decoration-ui-fg-faint" : ""}`}
          >
            {item.title}
          </span>
          {item.cancelled && <Badge tone="bad">Cancelled</Badge>}
          {item.important && !item.cancelled && <Badge tone="accent">{item.kind || "Important"}</Badge>}
        </span>
        {meta.length > 0 && (
          <span className="mt-0.5 block truncate text-xs text-ui-fg-muted">{meta.join(" · ")}</span>
        )}
      </span>

      <span className="shrink-0 self-center text-right text-xs tabular-nums">
        {live && <span className="font-semibold text-[var(--accent-fg)]">{remaining(item.end, now)}</span>}
        {soon && <span className="text-ui-fg-muted">{until(item.start, now)}</span>}
      </span>

      {live && (
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[color-mix(in_oklab,var(--accent)_20%,transparent)]" aria-hidden>
          <span
            className="block h-full bg-[var(--accent)]"
            style={{ width: `${Math.round(progress(item, now) * 100)}%` }}
          />
        </span>
      )}
    </li>
  );
}

function NextUp({ item, now }: { item: AgendaItem; now: number }) {
  const meta = [item.room, item.online ? "Online" : "", item.teacher].filter(Boolean);

  return (
    <div
      style={eventAccent(item.color, item.online)}
      className="flex items-stretch gap-3 rounded-lg border border-ui-border-soft bg-ui-surface p-3"
    >
      <span className="w-1 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium tracking-wide text-ui-fg-muted uppercase">
          Next · {dayLabel(item.start, now)}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-ui-fg">{item.title}</span>
          {item.important && <Badge tone="accent">{item.kind || "Important"}</Badge>}
        </span>
        <span className="mt-0.5 block truncate text-xs text-ui-fg-muted tabular-nums">
          {[`${clockTime(item.start)}–${clockTime(item.end)}`, ...meta].join(" · ")}
        </span>
      </span>
      <span className="shrink-0 self-center text-xs font-medium text-[var(--accent-fg)]">
        {until(item.start, now)}
      </span>
    </div>
  );
}
