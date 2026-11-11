export type CalendarView = "week" | "month" | "year";

export const calendarViews: { value: CalendarView; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

export const calendarTimeZone = "Europe/Berlin";

const locale = "en-GB";
const dayMs = 86_400_000;
const dayMinutes = 24 * 60;

export const dayStart = 8 * 60;
export const dayEnd = 18 * 60;

const segments = [
  { until: dayStart, weight: 0.5 },
  { until: dayEnd, weight: 1 },
  { until: dayMinutes, weight: 0.5 },
];

const totalUnits = segments.reduce(
  (sum, segment, index) =>
    sum + (segment.until - (segments[index - 1]?.until ?? 0)) * segment.weight,
  0,
);

export const hourLines = Array.from({ length: 23 }, (_, index) => index + 1);

export const hourLabels = hourLines.filter(
  (hour) => (hour * 60 >= dayStart && hour * 60 <= dayEnd) || hour % 2 === 0,
);

export function timeOffset(minutes: number) {
  let units = 0;
  let from = 0;

  for (const segment of segments) {
    const span = Math.min(Math.max(minutes - from, 0), segment.until - from);
    units += span * segment.weight;
    from = segment.until;
  }

  return (units / totalUnits) * 100;
}

export function minutesAt(percent: number) {
  let units = (Math.min(Math.max(percent, 0), 100) / 100) * totalUnits;
  let from = 0;

  for (const segment of segments) {
    const span = (segment.until - from) * segment.weight;
    if (units <= span) return from + units / segment.weight;
    units -= span;
    from = segment.until;
  }

  return dayMinutes;
}

export function formatTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function toDay(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day));
}

export function formatDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function parseDay(value: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const date = toDay(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return formatDay(date) === value ? date : null;
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * dayMs);
}

export function addMonths(date: Date, months: number) {
  const target = toDay(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
  const lastDay = toDay(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    0,
  ).getUTCDate();

  return toDay(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    Math.min(date.getUTCDate(), lastDay),
  );
}

export function startOfWeek(date: Date) {
  return addDays(date, -((date.getUTCDay() + 6) % 7));
}

export function startOfMonth(date: Date) {
  return toDay(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

export function sameDay(a: Date, b: Date) {
  return a.getTime() === b.getTime();
}

export function weekDays(date: Date) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function monthWeeks(date: Date) {
  const start = startOfWeek(startOfMonth(date));
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(start, week * 7 + day)),
  );
}

export function isoWeek(date: Date) {
  const thursday = addDays(date, 3 - ((date.getUTCDay() + 6) % 7));
  const yearStart = toDay(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - yearStart.getTime()) / dayMs / 7) + 1;
}

function zonedParts(timeZone: string, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);

  const part = (type: string) =>
    Number(parts.find((entry) => entry.type === type)?.value);

  return {
    day: toDay(part("year"), part("month") - 1, part("day")),
    minutes: part("hour") * 60 + part("minute"),
  };
}

export function todayIn(timeZone = calendarTimeZone) {
  return zonedParts(timeZone).day;
}

export function nowIn(timeZone = calendarTimeZone) {
  return zonedParts(timeZone);
}

export function zonedStamp(at: Date, timeZone = calendarTimeZone) {
  const { day, minutes } = zonedParts(timeZone, at);
  return `${formatDay(day)}T${formatTime(minutes)}`;
}

const timePatterns = [
  /^(\d{1,2}):(\d{1,2})$/,
  /^(\d{1,2})(\d{2})$/,
  /^(\d{1,2})()$/,
];

export function parseTime(raw: string) {
  const value = raw.trim();
  const match = timePatterns
    .map((pattern) => value.match(pattern))
    .find((result) => result !== null);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  if (hours > 23 || minutes > 59) return null;

  return formatTime(hours * 60 + minutes);
}

export const dayLong = formatter({
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatter(options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options });
}

export const weekdayShort = formatter({ weekday: "short" });
export const weekdayNarrow = formatter({ weekday: "narrow" });
export const monthLong = formatter({ month: "long" });
export const monthYear = formatter({ month: "long", year: "numeric" });
const dayMonthYear = formatter({
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function periodTitle(view: CalendarView, date: Date) {
  if (view === "year") return String(date.getUTCFullYear());
  if (view === "month") return monthYear.format(date);

  const start = startOfWeek(date);
  return dayMonthYear.formatRange(start, addDays(start, 6));
}

export function shiftDate(view: CalendarView, date: Date, step: number) {
  if (view === "week") return addDays(date, step * 7);
  if (view === "month") return addMonths(date, step);
  return addMonths(date, step * 12);
}

export function calendarHref(view: CalendarView, date?: Date) {
  return date ? `?view=${view}&date=${formatDay(date)}` : `?view=${view}`;
}

function isView(value: string | null): value is CalendarView {
  return calendarViews.some((entry) => entry.value === value);
}

export function calendarState(url: URL) {
  const view = url.searchParams.get("view");
  const today = todayIn();
  const date = parseDay(url.searchParams.get("date")) ?? today;

  return {
    view: isView(view) ? view : ("week" as CalendarView),
    date: formatDay(date),
    today: formatDay(today),
  };
}
