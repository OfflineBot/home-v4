export type DHBWModule = "dualis" | "mail" | "moodle";

export type DualisGuard = {
  failures: number;
  max_failures: number;
  locked: boolean;
  next_attempt_at: string | null;
  last_failure_at: string | null;
};

export type DHBWAccount = {
  name: string | null;
  logins: Partial<Record<DHBWModule, string>>;
  dualis_guard?: DualisGuard | null;
} & Record<DHBWModule, boolean>;

export type DHBWResult = {
  ok: boolean;
  message: string;
};

export const dhbwModules: { name: DHBWModule; label: string }[] = [
  { name: "dualis", label: "Dualis" },
  { name: "mail", label: "Email" },
  { name: "moodle", label: "Moodle" },
];

export function isDHBWModule(value: string): value is DHBWModule {
  return dhbwModules.some((module) => module.name === value);
}

export const timetableModule = "timetable";

export const dhbwLocations = [
  { code: "RV", label: "Ravensburg" },
  { code: "FN", label: "Friedrichshafen" },
  { code: "HDH", label: "Heidenheim" },
  { code: "HN", label: "Heilbronn" },
  { code: "KA", label: "Karlsruhe" },
  { code: "LOE", label: "Lörrach" },
  { code: "MA", label: "Mannheim" },
  { code: "MGH", label: "Bad Mergentheim" },
  { code: "MOS", label: "Mosbach" },
  { code: "S", label: "Stuttgart" },
  { code: "VS", label: "Villingen-Schwenningen" },
];

export const defaultLocation = "RV";
export const coursePattern = "[A-Za-z0-9\\- ]{2,24}";

export function splitCourse(value: string | null) {
  const [location, ...rest] = (value ?? "").split("-");
  const known = dhbwLocations.some((entry) => entry.code === location);

  return {
    location: known ? location : defaultLocation,
    course: known ? rest.join("-") : "",
  };
}

export function joinCourse(location: string, course: string) {
  const value = course.toUpperCase().replace(/\s+/g, "");
  const prefix = dhbwLocations.find((entry) =>
    value.startsWith(`${entry.code}-`),
  )?.code;
  const rest = prefix ? value.slice(prefix.length + 1) : value;

  return `${prefix ?? location}-${rest.replace(/-/g, "")}`;
}

export function dhbwLabel(value: string) {
  if (value === timetableModule) return "dhbw.app";
  return dhbwModules.find((module) => module.name === value)?.label ?? value;
}

export function dhbwError(
  code: string | undefined,
  module: string,
  status: number,
) {
  const label = dhbwLabel(module);

  switch (code) {
    case "login_failed":
      return `${label} rejected the login. Nothing was saved.`;
    case "verify_failed":
      return module === timetableModule
        ? "dhbw.app could not be reached to check the course. Nothing was saved."
        : `${label} could not be reached to check the login. Nothing was saved.`;
    case "invalid_course":
    case "invalid_url":
      return "This is not a valid course.";
    case "invalid_calendar":
    case "unknown_course":
      return "dhbw.app does not know this course.";
    case "name_missing":
      return "Save the username first.";
    case "invalid_name":
      return "This username is not valid.";
    case "invalid_password":
      return "The password is empty or too long.";
    case "unknown_module":
      return "Unknown service.";
    case "too_many_attempts":
      return "Too many attempts. Wait a minute and try again.";
    case "locked":
      return "Dualis is locked after failed logins. Reset the lock first.";
    case "backoff":
      return "Dualis waits before the next login attempt. Try again later.";
    case "confirm_required":
      return "Confirm the reset first.";
    default:
      return `Failed (${status})`;
  }
}
