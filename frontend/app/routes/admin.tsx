import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/admin";
import { CreateUserForm, UserDetail } from "../components/admin/user-detail";
import { Badge, Block, ExpandableBlock, Stack, Stat } from "../components/block";
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
  type AdminDetail,
  type AdminOverview,
  type AdminUser,
} from "../lib/admin";
import { formatBytes } from "../lib/format";
import { api, unreachableStatus } from "../lib/api";
import { navColor } from "../lib/nav";
import { requireToken } from "../lib/session";

export function meta() {
  return [{ title: "Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const headers = { Authorization: `Bearer ${token}` };
  const selected = new URL(request.url).searchParams.get("user");
  const [me, list, overviewRes, detailRes] = await Promise.all([
    api("/api/auth/me", { headers }),
    api("/api/admin/users", { headers }),
    api("/api/admin/", { headers }),
    selected
      ? api(`/api/admin/users/detail?${new URLSearchParams({ name: selected })}`, { headers })
      : null,
  ]);

  const self = me.ok ? await me.json() : null;
  if (!self?.is_admin || list.status === 403) {
    throw new Response("Not found", { status: 404 });
  }

  const users: AdminUser[] = list.ok
    ? ((await list.json()).users ?? []).map(toAdminUser)
    : [];

  const overview = overviewRes.ok ? ((await overviewRes.json()) as AdminOverview) : null;
  const detail = detailRes?.ok ? ((await detailRes.json()) as AdminDetail) : null;

  return {
    self: String(self.name),
    users: users.sort((a, b) => a.name.localeCompare(b.name)),
    overview,
    selected: detail ? selected : null,
    detail,
  };
}

export async function action({
  request,
}: Route.ActionArgs): Promise<ActionResult> {
  const token = await requireToken(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const passwordHash = String(form.get("passwordHash") ?? "");

  let path: string;
  let body: Record<string, unknown>;
  if (intent === "create" && name && passwordHash) {
    path = "create";
    body = { name, passwordHash, is_admin: form.get("is_admin") === "true" };
  } else if (intent === "set-password" && name && passwordHash) {
    path = "password";
    body = { name, passwordHash };
  } else if (isAdminIntent(intent) && name) {
    const target = adminActions[intent];
    path = target.path;
    body = target.admin === undefined ? { name } : { name, is_admin: target.admin };
  } else {
    return { ok: false, message: "Unknown action" };
  }

  const res = await api(`/api/admin/users/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.ok) return { ok: true, message: "Done." };
  if (res.status === unreachableStatus) {
    return { ok: false, message: "Backend not reachable" };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: false, message: adminError(res.status, data.error) };
}

export default function Admin({ loaderData }: Route.ComponentProps) {
  const { self, users, overview, selected, detail } = loaderData;
  const pending = users.filter((user) => !user.approved);
  const active = users.filter((user) => user.approved);

  return (
    <Page title="Admin" icon="security" color={navColor("admin")}>
      <Stack>
        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <Stat label="Users" value={String(overview?.users.total ?? users.length)} />
          <Stat label="Waiting" value={String(overview?.users.pending ?? pending.length)} />
          <Stat
            label="Admins"
            value={String(overview?.users.admins ?? users.filter((user) => user.isAdmin).length)}
          />
          <Stat
            label="Locked"
            value={String(overview?.users.locked ?? users.filter((user) => user.locked).length)}
          />
          <Stat label="Failing syncs" value={overview?.sync ? String(overview.sync.failing) : "/"} />
          <Stat
            label="Storage"
            value={overview ? formatBytes(overview.storage.files_bytes + overview.storage.database_bytes) : "/"}
          />
        </div>

        <ExpandableBlock title="Add user" icon="user" color="green" summary={null}>
          <CreateUserForm />
        </ExpandableBlock>

        {pending.length > 0 && (
          <Block title="Waiting for approval">
            <UserList users={pending} self={self} selected={selected} detail={detail} />
          </Block>
        )}

        <Block title="Users">
          {active.length === 0 ? (
            <p className="text-sm text-ui-fg-muted">No approved users.</p>
          ) : (
            <UserList users={active} self={self} selected={selected} detail={detail} />
          )}
        </Block>
      </Stack>
    </Page>
  );
}

type UserListProps = {
  users: AdminUser[];
  self: string;
  selected: string | null;
  detail: AdminDetail | null;
};

function UserList({ users, self, selected, detail }: UserListProps) {
  return (
    <ul className="flex flex-col divide-y divide-ui-border-soft">
      {users.map((user) => (
        <UserRow
          key={user.id || user.name}
          user={user}
          isSelf={user.name.toLowerCase() === self.toLowerCase()}
          detail={selected?.toLowerCase() === user.name.toLowerCase() ? detail : null}
        />
      ))}
    </ul>
  );
}

function UserRow({ user, isSelf, detail }: { user: AdminUser; isSelf: boolean; detail: AdminDetail | null }) {
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
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-ui-fg">
              {user.name}
            </span>
            {isSelf && <Badge tone="accent">You</Badge>}
            {user.isAdmin && <Badge>Admin</Badge>}
            {user.twoFactor && <Badge tone="good">2FA</Badge>}
            {user.locked && <Badge tone="bad">{user.lockedPermanently ? "Locked" : "Locked for now"}</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-ui-fg-muted tabular-nums">
            {[
              `Joined ${formatJoined(user.createdAt)}`,
              `${user.sessions} session${user.sessions === 1 ? "" : "s"}`,
              user.loginFailures > 0 ? `${user.loginFailures} failed logins` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Link
          to={detail ? "?" : `?${new URLSearchParams({ user: user.name })}`}
          preventScrollReset
          className={buttonClass + " inline-flex items-center"}
        >
          {detail ? "Hide" : "Details"}
        </Link>

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
      </div>
      {detail && <UserDetail name={user.name} detail={detail} isSelf={isSelf} />}
    </li>
  );
}
