import { useState } from "react";
import type { Route } from "./+types/admin";
import { Badge, Block, Stack, Stat } from "../components/block";
import { Page } from "../components/page";
import {
  buttonClass,
  dangerButtonClass,
  primaryButtonClass,
} from "../components/setting-row";
import {
  useSubmission,
  type ActionResult,
} from "../components/use-submission";
import {
  adminActions,
  adminError,
  formatJoined,
  isAdminIntent,
  toAdminUser,
  type AdminUser,
} from "../lib/admin";
import { api, unreachableStatus } from "../lib/api";
import { navColor } from "../lib/nav";
import { requireToken } from "../lib/session";

export function meta() {
  return [{ title: "Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const headers = { Authorization: `Bearer ${token}` };
  const [me, list] = await Promise.all([
    api("/api/auth/me", { headers }),
    api("/api/admin/users", { headers }),
  ]);

  const self = me.ok ? await me.json() : null;
  if (!self?.is_admin || list.status === 403) {
    throw new Response("Not found", { status: 404 });
  }

  const users: AdminUser[] = list.ok
    ? ((await list.json()).users ?? []).map(toAdminUser)
    : [];

  return {
    self: String(self.name),
    users: users.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function action({
  request,
}: Route.ActionArgs): Promise<ActionResult> {
  const token = await requireToken(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const name = String(form.get("name") ?? "");

  if (!isAdminIntent(intent) || name === "") {
    return { ok: false, message: "Unknown action" };
  }

  const target = adminActions[intent];
  const res = await api(`/api/admin/users/${target.path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      target.admin === undefined ? { name } : { name, is_admin: target.admin },
    ),
  });

  if (res.ok) return { ok: true, message: "Done." };
  if (res.status === unreachableStatus) {
    return { ok: false, message: "Backend not reachable" };
  }
  return { ok: false, message: adminError(res.status) };
}

export default function Admin({ loaderData }: Route.ComponentProps) {
  const { self, users } = loaderData;
  const pending = users.filter((user) => !user.approved);
  const active = users.filter((user) => user.approved);

  return (
    <Page title="Admin" icon="security" color={navColor("admin")}>
      <Stack>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Users" value={String(users.length)} />
          <Stat label="Waiting" value={String(pending.length)} />
          <Stat
            label="Admins"
            value={String(users.filter((user) => user.isAdmin).length)}
          />
          <Stat
            label="Locked"
            value={String(users.filter((user) => user.locked).length)}
          />
        </div>

        {pending.length > 0 && (
          <Block title="Waiting for approval">
            <UserList users={pending} self={self} />
          </Block>
        )}

        <Block title="Users">
          {active.length === 0 ? (
            <p className="text-sm text-ui-fg-muted">No approved users.</p>
          ) : (
            <UserList users={active} self={self} />
          )}
        </Block>
      </Stack>
    </Page>
  );
}

function UserList({ users, self }: { users: AdminUser[]; self: string }) {
  return (
    <ul className="flex flex-col divide-y divide-ui-border-soft">
      {users.map((user) => (
        <UserRow
          key={user.id || user.name}
          user={user}
          isSelf={user.name.toLowerCase() === self.toLowerCase()}
        />
      ))}
    </ul>
  );
}

function UserRow({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const { fetcher, busy, intent, toast } = useSubmission();
  const [confirming, setConfirming] = useState(false);

  function action(value: string, label: string, className = buttonClass) {
    return (
      <button
        type="submit"
        name="intent"
        value={value}
        disabled={busy}
        className={className}
      >
        {busy && intent === value ? "…" : label}
      </button>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-ui-fg">
            {user.name}
          </span>
          {isSelf && <Badge tone="accent">You</Badge>}
          {user.isAdmin && <Badge>Admin</Badge>}
          {user.twoFactor && <Badge tone="good">2FA</Badge>}
          {user.locked && <Badge tone="bad">Locked</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-ui-fg-muted tabular-nums">
          Joined {formatJoined(user.createdAt)}
        </p>
      </div>

      {!isSelf && (
        <fetcher.Form method="post" className="flex flex-wrap gap-2">
          <input type="hidden" name="name" value={user.name} />

          {!user.approved && action("approve", "Approve", primaryButtonClass)}
          {user.locked && action("unlock", "Unlock")}
          {user.approved &&
            (user.isAdmin
              ? action("remove-admin", "Remove admin")
              : action("make-admin", "Make admin"))}
          {user.twoFactor && action("reset-2fa", "Reset 2FA")}
          {user.approved && action("revoke", "Revoke access")}

          {confirming ? (
            action("delete", "Confirm delete", dangerButtonClass)
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy}
              className={dangerButtonClass}
            >
              Delete
            </button>
          )}
          {toast}
        </fetcher.Form>
      )}
    </li>
  );
}
