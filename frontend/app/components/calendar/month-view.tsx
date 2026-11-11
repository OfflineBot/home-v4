import { Link } from "react-router";
import {
  calendarHref,
  formatDay,
  formatTime,
  isoWeek,
  monthWeeks,
  sameDay,
  weekDays,
  weekdayShort,
} from "../../lib/calendar";
import {
  eventsOn,
  minutesOf,
  useCalendarEvents,
  type CalendarCategory,
  type CalendarEvent,
} from "../../lib/calendar-events";
import { eventAccent } from "../../lib/nav";

const columns = "grid-cols-[2.5rem_repeat(7,minmax(0,1fr))]";
const visibleEvents = 3;

type MonthViewProps = {
  date: Date;
  today: Date;
  categories: Map<string, CalendarCategory>;
  showHidden: boolean;
  revision: number;
};

export function MonthView({
  date,
  today,
  categories,
  showHidden,
  revision,
}: MonthViewProps) {
  const weeks = monthWeeks(date);
  const events = useCalendarEvents(weeks[0][0], weeks[5][6], revision);
  const month = date.getUTCMonth();

  return (
    <div className="flex min-h-[32rem] flex-1 flex-col overflow-hidden rounded-xl border border-ui-border bg-ui-raised">
      <div className={`grid ${columns} border-b border-ui-border bg-ui-surface`}>
        <span />
        {weekDays(date).map((day) => (
          <span
            key={formatDay(day)}
            className="border-l border-ui-border-soft py-2 text-center text-[11px] font-medium tracking-wide text-ui-fg-muted uppercase"
          >
            {weekdayShort.format(day)}
          </span>
        ))}
      </div>

      <div className="grid flex-1 grid-rows-6">
        {weeks.map((week) => (
          <div
            key={formatDay(week[0])}
            className={`grid min-h-0 ${columns} border-b border-ui-border-soft last:border-b-0`}
          >
            <Link
              to={calendarHref("week", week[0])}
              aria-label={`Week ${isoWeek(week[0])}`}
              className="pt-2 text-center text-[11px] text-ui-fg-faint tabular-nums outline-none transition-colors hover:text-[var(--accent-fg)] focus-visible:ring-2 focus-visible:ring-ui-ring focus-visible:ring-inset motion-reduce:transition-none"
            >
              {isoWeek(week[0])}
            </Link>
            {week.map((day) => (
              <DayCell
                key={formatDay(day)}
                day={day}
                inMonth={day.getUTCMonth() === month}
                today={sameDay(day, today)}
                events={
                  events ? eventsOn(events, day, categories, showHidden) : []
                }
                categories={categories}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

type DayCellProps = {
  day: Date;
  inMonth: boolean;
  today: boolean;
  events: CalendarEvent[];
  categories: Map<string, CalendarCategory>;
};

function DayCell({ day, inMonth, today, events, categories }: DayCellProps) {
  const hidden = events.length - visibleEvents;
  const ordered = [...events].sort(
    (a, b) =>
      Number(b.mark === "important") - Number(a.mark === "important"),
  );

  return (
    <Link
      to={calendarHref("week", day)}
      className={`flex min-h-0 flex-col gap-0.5 overflow-hidden border-l border-ui-border-soft p-1.5 outline-none transition-colors hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring focus-visible:ring-inset motion-reduce:transition-none ${
        inMonth ? "" : "bg-ui-surface/60"
      }`}
    >
      <span
        className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums ${
          today
            ? "bg-[var(--accent)] text-ui-frame"
            : inMonth
              ? "text-ui-fg"
              : "text-ui-fg-faint"
        }`}
      >
        {day.getUTCDate()}
      </span>

      {ordered.slice(0, visibleEvents).map((event) => {
        const important = event.mark === "important";

        return (
          <span
            key={event.id}
            style={eventAccent(
              categories.get(event.categoryId)?.color ?? "overlay2",
              event.online,
            )}
            className={`flex min-w-0 animate-fade-in items-center gap-1.5 rounded px-1 text-[11px] leading-5 motion-reduce:animate-none ${
              important
                ? "bg-[var(--accent)] font-semibold text-ui-frame"
                : "text-ui-fg"
            } ${event.mark === "hidden" ? "opacity-50" : ""}`}
          >
            {!important && (
              <span className="size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
            )}
            <span
              className={`shrink-0 tabular-nums ${
                important ? "text-ui-frame/75" : "text-ui-fg-muted"
              }`}
            >
              {formatTime(minutesOf(event.start))}
            </span>
            <span className={`truncate ${event.cancelled ? "line-through" : ""}`}>
              {event.title}
            </span>
          </span>
        );
      })}

      {hidden > 0 && (
        <span className="px-1 text-[11px] leading-5 text-ui-fg-muted">
          +{hidden} more
        </span>
      )}
    </Link>
  );
}
