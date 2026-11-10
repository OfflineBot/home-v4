import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { Icon } from "./icons";
import { accent, navItems, settingsItem } from "../lib/nav";
import { cookieName } from "../lib/sidebar";

const row =
  "flex items-center justify-start overflow-hidden rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-ctp-overlay0";
const slot = "grid size-5 shrink-0 place-items-center";

type SidebarProps = {
  defaultOpen?: boolean;
};

export function Sidebar({ defaultOpen = true }: SidebarProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const account = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: PointerEvent) {
      if (!account.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function toggle() {
    const next = !open;
    setOpen(next);
    document.cookie = `${cookieName}=${
      next ? "open" : "closed"
    }; path=/; max-age=31536000; samesite=lax`;
  }

  const label = `truncate text-sm transition-[opacity,width,margin] duration-200 ease-out ${
    open ? "ml-3 opacity-100" : "ml-0 w-0 opacity-0"
  }`;

  return (
    <aside
      className={`flex shrink-0 flex-col transition-[width,padding] duration-200 ease-out ${
        open ? "w-56 px-2" : "w-11 px-1"
      }`}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
        title="home-v4"
        className={`${row} h-12 cursor-pointer text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-text`}
      >
        <span className={slot}>
          <Icon name="menu" />
        </span>
        <span className={`${label} font-semibold text-ctp-mauve`}>home-v4</span>
      </button>

      <nav className="mt-2 flex flex-col gap-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.slug}
            to={`/${item.slug}`}
            title={item.label}
            style={accent(item)}
            className={({ isActive }) =>
              `${row} h-9 hover:bg-ctp-surface0 ${
                isActive
                  ? "bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent)]"
                  : "text-ctp-subtext0 hover:text-ctp-text"
              }`
            }
          >
            <span className={`${slot} text-[var(--accent)]`}>
              <Icon name={item.slug} />
            </span>
            <span className={label}>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div
        ref={account}
        className="relative mt-auto border-t border-ctp-surface0 pt-2"
      >
        {menuOpen && (
          <div
            role="menu"
            className="absolute bottom-full left-0 mb-2 w-48 rounded-lg border border-ctp-surface0 bg-ctp-base p-1"
          >
            <Link
              to={`/${settingsItem.slug}`}
              role="menuitem"
              style={accent(settingsItem)}
              className={`${row} gap-3 h-9 text-sm text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-text`}
            >
              <span className={`${slot} text-[var(--accent)]`}>
                <Icon name={settingsItem.slug} />
              </span>
              {settingsItem.label}
            </Link>
            <Link
              to="/login"
              role="menuitem"
              className={`${row} gap-3 h-9 text-sm text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-text`}
            >
              <span className={`${slot} text-ctp-red`}>
                <Icon name="logout" />
              </span>
              Logout
            </Link>
          </div>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          title="Account"
          className={`group ${row} h-9 w-full cursor-pointer text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-text`}
        >
          <span className={slot}>
            <span className="grid size-5 shrink-0 place-items-center rounded-full border border-ctp-surface1 transition-colors group-hover:border-ctp-overlay0">
              <Icon name="user" className="size-3" />
            </span>
          </span>
          <span className={label}>Account</span>
        </button>
      </div>
    </aside>
  );
}
