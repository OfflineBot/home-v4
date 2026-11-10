export const cookieName = "sidebar";

export function readSidebarOpen(cookieHeader: string | null) {
  const match = cookieHeader?.match(
    new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`),
  );
  return match?.[1] !== "closed";
}
