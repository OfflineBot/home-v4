import { calendarTimeZone } from "./calendar";

export type AdminUser = {
  id: number;
  name: string;
  isAdmin: boolean;
  approved: boolean;
  twoFactor: boolean;
  locked: boolean;
  createdAt: string;
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
  delete: { path: "delete" },
};

export function isAdminIntent(value: string): value is AdminIntent {
  return value in adminActions;
}

const statusMessages: Record<number, string> = {
  403: "You cannot change your own account here.",
  404: "This user no longer exists.",
  409: "Nothing changed, or this would leave no admin.",
};

export function adminError(status: number) {
  return statusMessages[status] ?? `Failed (${status})`;
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
