import type { ReactNode } from "react";

const paths: Record<string, ReactNode> = {
  automation: <path d="M14 2 5 14h6l-1 8 9-12h-6l1-8Z" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 11h18" />
    </>
  ),
  files: <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
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
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  logout: <path d="M15 16.5l4-4.5-4-4.5M19 12H9.5M12.5 3.5H6.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h6" />,
  home: <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.5Z" />,
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
