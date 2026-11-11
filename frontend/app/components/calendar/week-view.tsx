import {
  dayEnd,
  dayStart,
  formatDay,
  formatTime,
  hourLabels,
  hourLines,
  isoWeek,
  minutesAt,
  sameDay,
  timeOffset,
  weekDays,
  weekdayShort,
} from "../../lib/calendar";
import {
  eventsOn,
  layoutDay,
  minutesOf,
  useCalendarEvents,
  type CalendarCategory,
  type CalendarEvent,
  type PlacedEvent,
} from "../../lib/calendar-events";
import { eventAccent } from "../../lib/nav";
import { useNow } from "../../lib/use-now";

const columns = "grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]";
const snapMinutes = 30;

type WeekViewProps = {
  date: Date;
  today: Date;
  categories: Map<string, CalendarCategory>;
  showHidden: boolean;
  revision: number;
  onCreate: (day: Date, minutes: number) => void;
  onEdit: (event: CalendarEvent) => void;
};

export function WeekView({
  date,
  today,
  categories,
  showHidden,
  revision,
  onCreate,
  onEdit,
}: WeekViewProps) {
  const days = weekDays(date);
  const events = useCalendarEvents(days[0], days[6], revision);
  const now = useNow();
  const nowInWeek = now && days.some((day) => sameDay(day, now.day));

  return (
    <div className="flex min-h-[36rem] flex-1 flex-col overflow-hidden rounded-xl border border-ui-border bg-ui-raised">
      <div className={`grid ${columns} border-b border-ui-border bg-ui-surface`}>
        <div className="flex items-end justify-center pb-2 text-[11px] font-medium text-ui-fg-faint tabular-nums">
          W{isoWeek(date)}
        </div>
        {days.map((day) => (
          <DayHeader
            key={formatDay(day)}
            day={day}
            today={sameDay(day, today)}
          />
        ))}
      </div>

      <div className={`relative grid flex-1 ${columns}`}>
        <HourGrid />
        <TimeGutter now={nowInWeek ? now.minutes : null} />
        {days.map((day) => (
          <DayColumn
            key={formatDay(day)}
            day={day}
            today={sameDay(day, today)}
            events={
              events ? eventsOn(events, day, categories, showHidden) : []
            }
            categories={categories}
            now={now && sameDay(now.day, day) ? now.minutes : null}
            onCreate={onCreate}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  );
}

function DayHeader({ day, today }: { day: Date; today: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5 border-l border-ui-border-soft py-2">
      <span
        className={`text-[11px] font-medium tracking-wide uppercase ${
          today ? "text-[var(--accent-fg)]" : "text-ui-fg-muted"
        }`}
      >
        {weekdayShort.format(day)}
      </span>
      <span
        className={`grid size-8 place-items-center rounded-full text-base font-semibold tabular-nums ${
          today ? "bg-[var(--accent)] text-ui-frame" : "text-ui-fg"
        }`}
      >
        {day.getUTCDate()}
      </span>
    </div>
  );
}

function HourGrid() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 right-0 left-14"
    >
      <div
        className="absolute inset-x-0 top-0 bg-ui-surface/60"
        style={{ height: `${timeOffset(dayStart)}%` }}
      />
      <div
        className="absolute inset-x-0 bottom-0 bg-ui-surface/60"
        style={{ top: `${timeOffset(dayEnd)}%` }}
      />
      {hourLines.map((hour) => (
        <div
          key={hour}
          className={`absolute inset-x-0 border-t ${
            hour * 60 === dayStart || hour * 60 === dayEnd
              ? "border-ui-border"
              : "border-ui-border-soft"
          }`}
          style={{ top: `${timeOffset(hour * 60)}%` }}
        />
      ))}
    </div>
  );
}

function TimeGutter({ now }: { now: number | null }) {
  return (
    <div aria-hidden className="relative">
      {hourLabels.map((hour) => (
        <span
          key={hour}
          className="absolute right-2 -translate-y-1/2 text-[11px] text-ui-fg-faint tabular-nums"
          style={{ top: `${timeOffset(hour * 60)}%` }}
        >
          {formatTime(hour * 60)}
        </span>
      ))}
      {now !== null && (
        <span
          className="absolute right-1 z-10 -translate-y-1/2 animate-fade-in rounded bg-ctp-red px-1 text-[10px] leading-4 font-semibold text-ui-frame tabular-nums motion-reduce:animate-none"
          style={{ top: `${timeOffset(now)}%` }}
        >
          {formatTime(now)}
        </span>
      )}
    </div>
  );
}

type DayColumnProps = {
  day: Date;
  today: boolean;
  events: CalendarEvent[];
  categories: Map<string, CalendarCategory>;
  now: number | null;
  onCreate: (day: Date, minutes: number) => void;
  onEdit: (event: CalendarEvent) => void;
};

function DayColumn({
  day,
  today,
  events,
  categories,
  now,
  onCreate,
  onEdit,
}: DayColumnProps) {
  function create(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const minutes = minutesAt(((event.clientY - rect.top) / rect.height) * 100);
    onCreate(day, Math.floor(minutes / snapMinutes) * snapMinutes);
  }

  return (
    <div
      onClick={create}
      title="Click to add an event"
      className={`relative border-l border-ui-border-soft ${
        today ? "bg-[color-mix(in_oklab,var(--accent)_6%,transparent)]" : ""
      }`}
    >
      {layoutDay(events).map((placed) => (
        <EventBlock
          key={placed.event.id}
          {...placed}
          color={categories.get(placed.event.categoryId)?.color ?? "overlay2"}
          onEdit={onEdit}
        />
      ))}

      {now !== null && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-10 h-0.5 -translate-y-1/2 animate-fade-in bg-ctp-red motion-reduce:animate-none"
          style={{ top: `${timeOffset(now)}%` }}
        >
          <span className="absolute -top-[3px] -left-1 size-2 rounded-full bg-ctp-red" />
        </div>
      )}
    </div>
  );
}

type EventBlockProps = PlacedEvent & {
  color: string;
  onEdit: (event: CalendarEvent) => void;
};

function EventBlock({ event, lane, lanes, color, onEdit }: EventBlockProps) {
  const start = minutesOf(event.start);
  const end = minutesOf(event.end);
  const top = timeOffset(start);
  const time = `${formatTime(start)}–${formatTime(end)}`;
  const important = event.mark === "important";
  const meta = [time, event.room, event.online ? "Online" : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={() => onEdit(event)}
      title={`${event.title} · ${meta}`}
      className={`absolute flex min-h-5 animate-fade-in cursor-pointer flex-col overflow-hidden rounded-md border-l-2 px-1.5 py-0.5 text-left text-xs leading-tight outline-none transition-[background-color,opacity] focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:animate-none motion-reduce:transition-none ${
        important
          ? "border-ui-frame/40 bg-[var(--accent)] text-ui-frame hover:opacity-90"
          : "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_16%,var(--ui-raised))] text-ui-fg hover:bg-[color-mix(in_oklab,var(--accent)_26%,var(--ui-raised))]"
      } ${event.mark === "hidden" ? "border-dashed opacity-50" : ""} ${
        event.cancelled ? "opacity-60" : ""
      }`}
      style={{
        ...eventAccent(color, event.online),
        top: `${top}%`,
        height: `${timeOffset(end) - top}%`,
        left: `calc(${(lane / lanes) * 100}% + 2px)`,
        width: `calc(${100 / lanes}% - 4px)`,
      }}
    >
      <span
        className={`w-full truncate ${important ? "font-semibold" : "font-medium"} ${
          event.cancelled ? "line-through" : ""
        }`}
      >
        {event.title}
      </span>
      <span
        className={`w-full truncate tabular-nums ${
          important ? "text-ui-frame/75" : "text-ui-fg-muted"
        }`}
      >
        {meta}
      </span>
    </button>
  );
}
