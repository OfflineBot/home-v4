import { useState } from "react";
import { Link, NavLink } from "react-router";
import { accent, navItems, settingsItem } from "../lib/nav";

const row =
  "flex h-10 items-center gap-3 overflow-hidden rounded-md px-2 text-sm";
const slot = "grid size-6 shrink-0 place-items-center";

export function Sidebar() {
  const [open, setOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const label = `truncate transition-opacity duration-200 ${
    open ? "opacity-100" : "opacity-0"
  }`;

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-ctp-surface0 bg-ctp-mantle p-2 transition-[width] duration-200 ease-out ${
        open ? "w-56" : "w-14"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title="home-v4"
        className={`${row} text-left hover:bg-ctp-surface0`}
      >
        <span className={slot}>
          <span className="size-2.5 rounded-sm bg-ctp-mauve" />
        </span>
        <span className={`${label} font-semibold text-ctp-mauve`}>
          home-v4
        </span>
      </button>

      <nav className="mt-3 flex flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.slug}
            to={`/${item.slug}`}
            title={item.label}
            style={accent(item)}
            className={({ isActive }) =>
              `${row} hover:bg-ctp-surface0 ${
                isActive
                  ? "bg-ctp-surface0 text-[var(--accent)]"
                  : "text-ctp-subtext0"
              }`
            }
          >
            <span className={slot}>
              <span className="size-2.5 rounded-full bg-[var(--accent)]" />
            </span>
            <span className={label}>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="relative mt-auto">
        {menuOpen && (
          <div className="absolute bottom-full left-0 mb-2 w-44 rounded-md border border-ctp-surface1 bg-ctp-surface0 p-1">
            <Link
              to={`/${settingsItem.slug}`}
              onClick={() => setMenuOpen(false)}
              style={accent(settingsItem)}
              className={`${row} text-ctp-subtext0 hover:bg-ctp-surface1 hover:text-[var(--accent)]`}
            >
              <span className={slot}>
                <span className="size-2.5 rounded-full bg-[var(--accent)]" />
              </span>
              <span className="truncate">{settingsItem.label}</span>
            </Link>
            <Link
              to="/login"
              onClick={() => setMenuOpen(false)}
              className={`${row} text-ctp-subtext0 hover:bg-ctp-surface1 hover:text-ctp-red`}
            >
              <span className={slot}>
                <span className="size-2.5 rounded-full bg-ctp-red" />
              </span>
              <span className="truncate">Logout</span>
            </Link>
          </div>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          title="Account"
          className={`group ${row} w-full hover:bg-ctp-surface0`}
        >
          <span className={slot}>
            <span className="grid size-6 place-items-center rounded-full border border-ctp-surface1 text-ctp-overlay0 transition-colors group-hover:border-ctp-overlay0 group-hover:text-ctp-text">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
                className="size-3.5"
              >
                <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2-7 4.5V20h14v-1.5c0-2.5-3-4.5-7-4.5Z" />
              </svg>
            </span>
          </span>
          <span className={`${label} text-ctp-subtext0 group-hover:text-ctp-text`}>
            Account
          </span>
        </button>
      </div>
    </aside>
  );
}
