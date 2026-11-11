import { calendarTimeZone } from "./calendar";

export type AdminUser = {
  id: number;
  name: string;
  isAdmin: boolean;
  approved: boolean;
  twoFactor: boolean;
  locked: boolean;
  lockedPermanently: boolean;
  lockedUntil: string | null;
  loginFailures: number;
  sessions: number;
  lastSessionAt: string | null;
  createdAt: string;
};

export type AdminOverview = {
  users: { total: number; admins: number; pending: number; locked: number };
  sync: { failing: number; dualis_locked: number } | null;
  storage: { files_bytes: number; database_bytes: number };
};

export type AdminDetail = {
  user: Record<string, unknown>;
  connections: { name: boolean; dualis: boolean; mail: boolean; moodle: boolean; timetable: boolean };
  dualis_guard: { failures: number; max_failures: number; locked: boolean; next_attempt_at: string | null } | null;
  sync: { job: string; running: boolean; success_at: string | null; error: string | null }[] | null;
  sessions: { created_at: string; expires_at: string }[] | null;
  data: Record<string, number> | null;
  storage_bytes: number;
};

export const dataLabels: Record<string, string> = {
  grades: "Grades",
  moodle_courses: "Moodle courses",
  moodle_files: "Moodle files",
  mails: "Mails",
  mail_attachments: "Attachments",
  calendar_events: "Timetable events",
  calendar_entries: "Own events",
};

function pick(raw: Record<string, unknown>, ...keys: string[]) {
  return keys.map((key) => raw[key]).find((value) => value !== undefined);
}

export function toAdminUser(raw: Record<string, unknown>): AdminUser {
  return {
    id: Number(pick(raw, "ID", "id") ?? 0),
    name: String(pick(raw, "Name", "name") ?? ""),
    isAdmin: pick(raw, "IsAdmin", "is_admin") === true,
    approved: pick(raw, "Approved", "approved") === true,
    twoFactor: pick(raw, "TwoFactor", "two_factor") === true,
    locked: pick(raw, "Locked", "locked") === true,
    lockedPermanently: pick(raw, "LockedPermanently", "locked_permanently") === true,
    lockedUntil: (pick(raw, "LockedUntil", "locked_until") as string | null | undefined) ?? null,
    loginFailures: Number(pick(raw, "LoginFailures", "login_failures") ?? 0),
    sessions: Number(pick(raw, "Sessions", "sessions") ?? 0),
    lastSessionAt: (pick(raw, "LastSessionAt", "last_session_at") as string | null | undefined) ?? null,
    createdAt: String(pick(raw, "CreatedAt", "created_at") ?? ""),
  };
}

export type AdminIntent =
  | "approve"
  | "revoke"
  | "unlock"
  | "make-admin"
  | "remove-admin"
  | "reset-2fa"
  | "logout-all"
  | "reset-dualis"
  | "delete";

export const adminActions: Record<
  AdminIntent,
  { path: string; admin?: boolean }
> = {
  approve: { path: "approve" },
  revoke: { path: "revoke" },
  unlock: { path: "unlock" },
  "make-admin": { path: "role", admin: true },
  "remove-admin": { path: "role", admin: false },
  "reset-2fa": { path: "2factor/reset" },
  "logout-all": { path: "sessions/delete" },
  "reset-dualis": { path: "dualis/reset" },
  delete: { path: "delete" },
};

export function isAdminIntent(value: string): value is AdminIntent {
  return value in adminActions;
}

const errorMessages: Record<string, string> = {
  self_target: "You cannot change your own account here.",
  unknown_user: "This user no longer exists.",
  last_admin: "This would leave no admin.",
  no_change: "Nothing changed.",
  name_taken: "This name is already taken.",
  invalid_name: "This name is not valid.",
  invalid_password: "The password could not be set.",
  invalid_body: "Check the details.",
};

const statusMessages: Record<number, string> = {
  403: errorMessages.self_target,
  404: errorMessages.unknown_user,
  409: "Nothing changed, or this would leave no admin.",
};

export function adminError(status: number, code?: string) {
  return (code && errorMessages[code]) || statusMessages[status] || `Failed (${status})`;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: calendarTimeZone,
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatJoined(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "/" : dateFormat.format(date);
}
