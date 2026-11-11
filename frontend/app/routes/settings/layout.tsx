import { NavLink, Outlet } from "react-router";
import type { Route } from "./+types/layout";
import { Icon } from "../../components/icons";
import { Page } from "../../components/page";
import { api } from "../../lib/api";
import { readSession } from "../../lib/session";
import { dangerItem, settingsGroups } from "../../lib/settings-nav";

export function meta() {
  return [{ title: "Settings" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await readSession(request.headers.get("Cookie"));
  const res = await api("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });

  return { me: res.ok ? await res.json() : null };
}

const row =
  "flex h-8 items-center gap-2.5 rounded-md px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ui-ring";

export default function SettingsLayout() {
  return (
    <Page title="Settings" icon="settings" color="green">
      <div className="flex h-full min-h-0 gap-4">
        <nav className="w-52 shrink-0 self-start rounded-xl border border-ui-border bg-ui-raised p-2">
          <div>
            {settingsGroups.map((group) => (
              <div key={group.label} className="mb-3 last:mb-0">
                <p className="mb-1 px-2 text-xs font-medium tracking-wide text-ui-fg-faint uppercase">
                  {group.label}
                </p>
                {group.items.map((item) => (
                  <NavLink
                    key={item.slug}
                    to={`/settings/${item.slug}`}
                    className={({ isActive }) =>
                      `${row} ${
                        isActive
                          ? "bg-ui-hover text-ui-fg"
                          : "text-ui-fg-muted hover:bg-ui-hover hover:text-ui-fg"
                      }`
                    }
                  >
                    <span className="grid size-4 shrink-0 place-items-center">
                      <Icon name={item.slug} className="size-4" />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-2 border-t border-ui-border-soft pt-2">
            <NavLink
              to={`/settings/${dangerItem.slug}`}
              className={({ isActive }) =>
                `${row} ${
                  isActive
                    ? "bg-[color-mix(in_oklab,var(--ui-danger)_14%,transparent)] text-ui-danger"
                    : "text-ui-fg-muted hover:bg-[color-mix(in_oklab,var(--ui-danger)_10%,transparent)] hover:text-ui-danger"
                }`
              }
            >
              <span className="grid size-4 shrink-0 place-items-center">
                <Icon name="trash" className="size-4" />
              </span>
              <span className="truncate">{dangerItem.label}</span>
            </NavLink>
          </div>
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </div>
    </Page>
  );
}
