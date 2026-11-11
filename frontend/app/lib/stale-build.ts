const reloadKey = "stale-build-reload";
const reloadWindowMs = 30_000;

const chunkErrors = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Unable to preload CSS/i,
];

export function isStaleBuildError(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return chunkErrors.some((pattern) => pattern.test(message));
}

export function reloadOnce() {
  try {
    const last = Number(window.sessionStorage.getItem(reloadKey) ?? 0);
    if (Date.now() - last < reloadWindowMs) return false;
    window.sessionStorage.setItem(reloadKey, String(Date.now()));
  } catch {
    return false;
  }

  window.location.reload();
  return true;
}
