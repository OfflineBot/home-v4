import type { ReactNode } from "react";

const paths: Record<string, ReactNode> = {
  automation: <path d="M14 2 5 14h6l-1 8 9-12h-6l1-8Z" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 11h18" />
    </>
  ),
  files: (
    <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  ),
  git: (
    <>
      <circle cx="6.5" cy="6" r="2.5" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="12" r="2.5" />
      <path d="M6.5 8.5v7M9 6h3.5a2.5 2.5 0 0 1 2.5 2.5v1.2" />
    </>
  ),
  grades: (
    <>
      <path d="M12 3.75 2 8.75l10 5 10-5-10-5Z" />
      <path d="M6 11.25V17.75c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-6.5" />
    </>
  ),
  lights: (
    <>
      <path d="M9.5 16.75h5M10.5 19.75h3" />
      <path d="M8 12.25a5 5 0 1 1 8 0c-.8 1-1.1 1.6-1.2 2.5H9.2c-.1-.9-.4-1.5-1.2-2.5Z" />
    </>
  ),
  machine: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
      <path d="M6.5 7.5h.01M6.5 16.5h.01" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7.5 8.5 5.5 8.5-5.5" />
    </>
  ),
  moodle: (
    <>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15Z" />
      <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3" />
      <path d="M9 7.5h6" />
    </>
  ),
  pages: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.8M12 18.7v2.8M4.6 4.6l2 2M17.4 17.4l2 2M2.5 12h2.8M18.7 12h2.8M4.6 19.4l2-2M17.4 6.6l2-2" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-3.4 3.6-5.2 7-5.2s6.2 1.8 7 5.2" />
    </>
  ),
  connections: (
    <>
      <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1.2 1.2" />
      <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1.2-1.2" />
    </>
  ),
  security: (
    <path d="M12 3 5 6v6c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-3Z" />
  ),
  sync: (
    <>
      <path d="M20 12a8 8 0 0 1-13.7 5.7M4 12a8 8 0 0 1 13.7-5.7" />
      <path d="M4 18v-4h4M20 6v4h-4" />
    </>
  ),
  appearance: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18 4.5 4.5 0 0 0 0-9 4.5 4.5 0 0 1 0-9Z" />
    </>
  ),
  notifications: (
    <>
      <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  public: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4a13 13 0 0 1 0 16M12 4a13 13 0 0 0 0 16" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7" />
      <path d="M6.5 7l.8 11.6a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L18.5 7" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  filter: <path d="M4 5.5h16l-6.25 7.25v5.5l-3.5 1.75v-7.25L4 5.5Z" />,
  reply: <path d="M9.5 14.5 4.5 9.5l5-5M4.5 9.5h9a6 6 0 0 1 6 6v3" />,
  "reply-all": (
    <path d="M8 14.5 3 9.5l5-5M12.5 14.5l-5-5 5-5M7.5 9.5h6.5a6 6 0 0 1 6 6v3" />
  ),
  forward: <path d="m14.5 14.5 5-5-5-5M19.5 9.5h-9a6 6 0 0 0-6 6v3" />,
  chevron: <path d="M9.5 6.5l5.5 5.5-5.5 5.5" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  folder: (
    <path d="M3 7.5a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.4.6L11.4 7.5H19a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9.5Z" />
  ),
  file: (
    <>
      <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8l-4.5-4.5Z" />
      <path d="M14 3.5V8h4.5" />
    </>
  ),
  upload: (
    <path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9M4.5 15v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" />
  ),
  download: (
    <path d="M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5M4.5 15v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" />
  ),
  move: (
    <>
      <path d="M3 7.5a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.4.6L11.4 7.5H19a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9.5Z" />
      <path d="M9 13.25h6M13 11l2.25 2.25L13 15.5" />
    </>
  ),
  edit: (
    <path d="M14.5 5.5 18.5 9.5M4.5 19.5l1-4.5L15.8 4.7a1.4 1.4 0 0 1 2 0l1.5 1.5a1.4 1.4 0 0 1 0 2L9 18.5l-4.5 1Z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  explore: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
  list: (
    <path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
  ),
  branch: (
    <>
      <circle cx="7" cy="5.5" r="2" />
      <circle cx="7" cy="18.5" r="2" />
      <circle cx="17" cy="7.5" r="2" />
      <path d="M7 7.5v9M17 9.5c0 4-4 4.5-8.5 7.3" />
    </>
  ),
  commit: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M3 12h5.5M15.5 12H21" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </>
  ),
  code: <path d="M8.5 7.5 4 12l4.5 4.5M15.5 7.5 20 12l-4.5 4.5M13.5 5l-3 14" />,
  power: (
    <>
      <path d="M12 3.5v7.5" />
      <path d="M7.4 6.6a7.5 7.5 0 1 0 9.2 0" />
    </>
  ),
  expand: <path d="M14.5 4.5h5v5M9.5 19.5h-5v-5M19.5 4.5l-6 6M4.5 19.5l6-6" />,
  shrink: <path d="M19.5 9.5h-5v-5M4.5 14.5h5v5M14.5 9.5l6-6M9.5 14.5l-6 6" />,
  alert: (
    <>
      <path d="M12 8.5v5" />
      <path d="M12 16.8v.01" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  logout: (
    <path d="M15 16.5l4-4.5-4-4.5M19 12H9.5M12.5 3.5H6.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h6" />
  ),
  home: (
    <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.5Z" />
  ),
  user: (
    <>
      <circle cx="12" cy="8.35" r="3.2" />
      <path d="M5.5 18.85c.9-3 3.4-4.6 6.5-4.6s5.6 1.6 6.5 4.6" />
    </>
  ),
};

type IconProps = {
  name: string;
  className?: string;
};

export function Icon({ name, className = "size-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths[name] ?? paths.pages}
    </svg>
  );
}
