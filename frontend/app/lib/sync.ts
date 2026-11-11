import { calendarTimeZone } from "./calendar";

export type SyncJob = {
  job: string;
  running: boolean;
  started_at: string | null;
  finished_at: string | null;
  success_at: string | null;
  error: string | null;
  interval_minutes: number;
  default_minutes: number;
  min_minutes: number;
  custom: boolean;
  next_run_at: string;
};

export const syncLabels: Record<string, string> = {
  dualis: "Dualis",
  mail: "Email",
  moodle: "Moodle",
  timetable: "Timetable",
};

export const syncOrder = Object.keys(syncLabels);

export function isSyncJob(value: string) {
  return syncOrder.includes(value);
}

const errorLabels: Record<string, string> = {
  not_configured: "Not set up",
  login_failed: "Login rejected",
  invalid_calendar: "Invalid timetable link",
  unreachable: "Not reachable",
};

export function syncError(code: string) {
  return errorLabels[code] ?? "Failed";
}

const stampFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: calendarTimeZone,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatStamp(value: string) {
  return stampFormat.format(new Date(value));
}
