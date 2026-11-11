import { calendarTimeZone } from "./calendar";

const byteUnits = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number) {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < byteUnits.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${byteUnits[unit]}`;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: calendarTimeZone,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: calendarTimeZone,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function parse(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string) {
  const date = parse(value);
  return date ? dateFormat.format(date) : "";
}

export function formatDateTime(value: string) {
  const date = parse(value);
  return date ? dateTimeFormat.format(date) : "";
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const steps: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function timeAgo(value: string, now = Date.now()) {
  const date = parse(value);
  if (!date) return "";
  const seconds = Math.round((date.getTime() - now) / 1000);
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
