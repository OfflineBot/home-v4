export const themeCookieName = "theme";

export type Theme = "dark" | "light";

export function readTheme(cookieHeader: string | null): Theme {
  const match = cookieHeader?.match(
    new RegExp(`(?:^|;\\s*)${themeCookieName}=([^;]*)`),
  );
  return match?.[1] === "light" ? "light" : "dark";
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.cookie = `${themeCookieName}=${theme}; path=/; max-age=31536000; samesite=lax`;
}
