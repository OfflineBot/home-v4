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
  return { "--accent": `var(--ctp-${item.color})` } as CSSProperties;
}
