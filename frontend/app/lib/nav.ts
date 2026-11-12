import type { CSSProperties } from "react";

export type NavItem = {
  slug: string;
  label: string;
  color: string;
};

export const navItems: NavItem[] = [
  { slug: "automation", label: "Automation", color: "mauve" },
  { slug: "calendar", label: "Calendar", color: "blue" },
  { slug: "files", label: "Files", color: "sapphire" },
  { slug: "git", label: "Git", color: "peach" },
  { slug: "grades", label: "Grades", color: "yellow" },
  { slug: "lights", label: "Lights", color: "pink" },
  { slug: "machine", label: "Machine", color: "red" },
  { slug: "mail", label: "Mail", color: "teal" },
  { slug: "moodle", label: "Moodle", color: "sky" },
  { slug: "pages", label: "Pages", color: "lavender" },
  { slug: "public", label: "Public", color: "flamingo" },
];

export const homeItem: NavItem = {
  slug: "",
  label: "Home",
  color: "mauve",
};

export const settingsItem: NavItem = {
  slug: "settings",
  label: "Settings",
  color: "green",
};

export const adminItem: NavItem = {
  slug: "admin",
  label: "Admin",
  color: "maroon",
};

export const allItems: NavItem[] = [...navItems, settingsItem];

export function eventAccent(color: string, online = false) {
  if (!online) return accentVars(color);

  const shift = color === "teal" ? "lavender" : "teal";
  const mixed = `color-mix(in oklab, var(--ctp-${color}) 50%, var(--ctp-${shift}))`;
  return {
    "--accent": mixed,
    "--accent-fg": `color-mix(in oklab, ${mixed} var(--accent-mix), var(--ui-fg))`,
  } as CSSProperties;
}

export function navColor(slug: string) {
  return allItems.find((item) => item.slug === slug)?.color ?? "mauve";
}

export const accentColors = [
  "rosewater",
  "flamingo",
  "pink",
  "mauve",
  "red",
  "maroon",
  "peach",
  "yellow",
  "green",
  "teal",
  "sky",
  "sapphire",
  "blue",
  "lavender",
];

export function accent(item: NavItem) {
  return accentVars(item.color);
}

// --accent paints surfaces and icons, --accent-fg is the text-safe variant:
// in a light theme the raw accent does not reach 4.5:1, so it is mixed toward --ui-fg
export function accentVars(color: string) {
  return {
    "--accent": `var(--ctp-${color})`,
    "--accent-fg": `color-mix(in oklab, var(--ctp-${color}) var(--accent-mix), var(--ui-fg))`,
  } as CSSProperties;
}
