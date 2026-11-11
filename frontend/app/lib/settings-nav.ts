export type SettingsItem = {
  slug: string;
  label: string;
  hint: string;
};

export type SettingsGroup = {
  label: string;
  items: SettingsItem[];
};

export const settingsGroups: SettingsGroup[] = [
  {
    label: "Account",
    items: [
      { slug: "profile", label: "Profile", hint: "Your display name" },
      { slug: "connections", label: "Connections", hint: "Linked services" },
      { slug: "security", label: "Security", hint: "Password and two factor" },
      { slug: "sync", label: "Background sync", hint: "Scheduled jobs" },
    ],
  },
  {
    label: "Site",
    items: [
      { slug: "appearance", label: "Appearance", hint: "Theme and colors" },
      {
        slug: "notifications",
        label: "Notifications",
        hint: "What you get told about",
      },
    ],
  },
];

export const dangerItem: SettingsItem = {
  slug: "delete",
  label: "Delete account",
  hint: "Remove this account for good",
};

export const settingsSlugs = [
  ...settingsGroups.flatMap((g) => g.items.map((i) => i.slug)),
  dangerItem.slug,
];
