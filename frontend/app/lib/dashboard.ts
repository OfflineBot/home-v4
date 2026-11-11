import { calendarTimeZone, zonedStamp } from "./calendar";
import type { Semester } from "./grades";

export type AgendaItem = {
  id: string;
  title: string;
  start: number;
  end: number;
  room: string;
  teacher: string;
  kind: string;
  online: boolean;
  cancelled: boolean;
  important: boolean;
  color: string;
  category: string;
};

export type GradeNotice = {
  key: string;
  name: string;
  graded: boolean;
};

export const gradesSeenCookie = "grades_seen";
export const agendaDays = 30;

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const cookieMaxAge = 60 * 60 * 24 * 365 * 2;
const maxSeenKeys = 450;

export function localDay(ms: number) {
  return zonedStamp(new Date(ms)).slice(0, 10);
}

export function clockTime(ms: number) {
  return zonedStamp(new Date(ms)).slice(11, 16);
}

const weekdayLong = new Intl.DateTimeFormat("en-GB", {
  timeZone: calendarTimeZone,
  weekday: "long",
});

const dateLong = new Intl.DateTimeFormat("en-GB", {
  timeZone: calendarTimeZone,
  day: "numeric",
  month: "long",
  year: "numeric",
});

const dayShort = new Intl.DateTimeFormat("en-GB", {
  timeZone: calendarTimeZone,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const secondsPart = new Intl.DateTimeFormat("en-GB", {
  timeZone: calendarTimeZone,
  second: "2-digit",
});

export function weekdayName(ms: number) {
  return weekdayLong.format(new Date(ms));
}

export function fullDate(ms: number) {
  return dateLong.format(new Date(ms));
}

export function seconds(ms: number) {
  return secondsPart.format(new Date(ms)).padStart(2, "0");
}

function dayDistance(from: number, to: number) {
  const a = Date.parse(`${localDay(from)}T00:00:00Z`);
  const b = Date.parse(`${localDay(to)}T00:00:00Z`);
  return Math.round((b - a) / (24 * hourMs));
}

export function dayLabel(ms: number, now: number) {
  const distance = dayDistance(now, ms);
  if (distance === 0) return "Today";
  if (distance === 1) return "Tomorrow";
  return dayShort.format(new Date(ms));
}

export function until(ms: number, now: number) {
  const diff = ms - now;
  if (diff <= 0) return "now";

  const distance = dayDistance(now, ms);
  if (distance >= 2) return `in ${distance} days`;

  const minutes = Math.ceil(diff / minuteMs);
  if (minutes < 60) return `in ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (distance === 1 && hours >= 12) return "tomorrow";

  const rest = minutes % 60;
  return rest === 0 ? `in ${hours} h` : `in ${hours} h ${rest} min`;
}

export function remaining(ms: number, now: number) {
  const minutes = Math.max(1, Math.ceil((ms - now) / minuteMs));
  if (minutes < 60) return `${minutes} min left`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h left` : `${hours} h ${rest} min left`;
}

export function progress(item: AgendaItem, now: number) {
  const span = item.end - item.start;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (now - item.start) / span));
}

export type DayPlan = {
  today: AgendaItem[];
  current: AgendaItem | null;
  next: AgendaItem | null;
  nextToday: AgendaItem | null;
  remainingToday: number;
};

export function planDay(items: AgendaItem[], now: number): DayPlan {
  const day = localDay(now);
  const today = items.filter(
    (item) => localDay(item.start) === day || (item.start < now && item.end > now),
  );
  const active = items.filter((item) => !item.cancelled);
  const current = active.find((item) => item.start <= now && item.end > now) ?? null;
  const next = active.find((item) => item.start > now) ?? null;
  const nextToday = next && localDay(next.start) === day ? next : null;
  const remainingToday = today.filter((item) => !item.cancelled && item.end > now).length;

  return { today, current, next, nextToday, remainingToday };
}

function hash(text: string) {
  let value = 0x811c9dc5;
  for (const char of text) {
    value ^= char.codePointAt(0) ?? 0;
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(36);
}

export function gradeNotices(semesters: Semester[]): GradeNotice[] {
  return semesters
    .flatMap((semester) => semester.modules)
    .filter((module) => module.grade !== null || module.status !== "pending")
    .map((module) => ({
      key: hash(`${module.semester_id}:${module.module_id}:${module.grade ?? ""}:${module.status}`),
      name: module.name,
      graded: module.grade !== null,
    }));
}

export function readSeen(cookieHeader: string | null) {
  const match = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${gradesSeenCookie}=([^;]*)`));
  const keys = (match?.[1] ?? "").split(".").filter((key) => /^[0-9a-z]{1,8}$/.test(key));
  return keys.length > 0 ? new Set(keys) : null;
}

export function writeSeen(keys: string[]) {
  const value = [...new Set(keys)].slice(-maxSeenKeys).join(".");
  if (value === "") return;
  document.cookie = `${gradesSeenCookie}=${value}; path=/; max-age=${cookieMaxAge}; samesite=lax`;
}
