import { eventAccent } from "../../lib/nav";
import { clockTime, localDay, type AgendaItem } from "../../lib/dashboard";

type DayTimelineProps = {
  items: AgendaItem[];
  now: number;
  day: string;
  showNow: boolean;
};

const dayMinutes = 24 * 60;
const defaultStart = 8 * 60;
const defaultEnd = 18 * 60;
const tickStep = 120;

function minuteOf(ms: number, day: string) {
  const stampDay = localDay(ms);
  if (stampDay < day) return 0;
  if (stampDay > day) return dayMinutes;
  const [hours, minutes] = clockTime(ms).split(":").map(Number);
  return hours * 60 + minutes;
}

function label(minutes: number) {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:00`;
}

export function DayTimeline({ items, now, day, showNow }: DayTimelineProps) {
  const current = minuteOf(now, day);
  const spans = items.map((item) => ({
    item,
    from: minuteOf(item.start, day),
    to: Math.max(minuteOf(item.end, day), minuteOf(item.start, day) + 10),
  }));

  const around = showNow ? [current - 30] : [];
  const earliest = Math.min(defaultStart, ...around, ...spans.map((span) => span.from));
  const latest = Math.max(defaultEnd, ...(showNow ? [current + 30] : []), ...spans.map((span) => span.to));
  const start = Math.max(0, Math.floor(earliest / tickStep) * tickStep);
  const end = Math.min(dayMinutes, Math.ceil(latest / tickStep) * tickStep);
  const range = Math.max(60, end - start);
  const at = (minutes: number) => `${((Math.min(end, Math.max(start, minutes)) - start) / range) * 100}%`;
  const ticks = Array.from({ length: Math.floor(range / tickStep) + 1 }, (_, index) => start + index * tickStep);

  return (
    <div className="flex flex-col gap-2" aria-label="Today's schedule">
      <div className="relative h-3">
        <div className="absolute inset-0 rounded-full bg-[color-mix(in_oklab,var(--ui-field)_70%,transparent)]" />
        {spans.map(({ item, from, to }) => {
          const past = item.end <= now;
          const live = !item.cancelled && item.start <= now && item.end > now;
          return (
            <span
              key={item.id}
              title={`${clockTime(item.start)}–${clockTime(item.end)} · ${item.title}`}
              style={{ ...eventAccent(item.color, item.online), left: at(from), width: `calc(${at(to)} - ${at(from)})` }}
              className={`absolute inset-y-0 rounded-full transition-opacity motion-reduce:transition-none ${
                item.cancelled
                  ? "border border-dashed border-[var(--accent)] bg-transparent opacity-60"
                  : `bg-[var(--accent)] ${past ? "opacity-35" : live ? "shadow-[0_0_14px_var(--accent)]" : "opacity-80"}`
              }`}
            />
          );
        })}
        {showNow && (
          <span
            className="absolute -top-1.5 -bottom-1.5 w-0.5 -translate-x-1/2 rounded-full bg-ui-fg"
            style={{ left: at(current) }}
            aria-hidden
          >
            <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-ui-fg" />
          </span>
        )}
      </div>
      <div className="relative h-4 text-[10px] text-ui-fg-faint tabular-nums">
        {ticks.map((tick, index) => (
          <span
            key={tick}
            className={`absolute top-0 ${index === 0 ? "" : index === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"} ${
              index % 2 === 1 && index !== ticks.length - 1 ? "hidden sm:block" : ""
            }`}
            style={{ left: at(tick) }}
          >
            {label(tick)}
          </span>
        ))}
      </div>
    </div>
  );
}
