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
  { slug: "pages", label: "Pages", color: "lavender" },
];

export const settingsItem: NavItem = {
  slug: "settings",
  label: "Settings",
  color: "green",
};

export const allItems: NavItem[] = [...navItems, settingsItem];

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
