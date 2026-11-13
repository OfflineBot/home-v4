import { useState } from "react";
import type { Route } from "./+types/notifications";
import { Badge, Block, Stack } from "../../components/block";
import { Icon } from "../../components/icons";
import { PowerSwitch } from "../../components/lights/controls";
import { buttonClass, dangerButtonClass } from "../../components/setting-row";
import { Toast } from "../../components/toast";
import {
  useSubmission,
  type ActionResult,
} from "../../components/use-submission";
import { api, unreachableStatus } from "../../lib/api";
import { requireToken } from "../../lib/session";

type Settings = { hook_enabled: boolean; hook_key: string };

const base = "/api/notifications";

const codeClass =
  "mt-3 block overflow-x-auto rounded-md border border-ui-border bg-ui-field px-3 py-2 text-xs text-ui-fg-muted";

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const res = await api(`${base}/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const settings: Settings = res.ok
    ? await res.json()
    : { hook_enabled: false, hook_key: "" };

  return { settings, reachable: res.status !== unreachableStatus };
}

export async function action({
  request,
}: Route.ActionArgs): Promise<ActionResult> {
  const token = await requireToken(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  let res: Response;
  switch (intent) {
    case "hook":
      res = await api(`${base}/settings`, {
        method: "POST",
        headers,
        body: JSON.stringify({ hook_enabled: form.get("enabled") === "true" }),
      });
      break;
    case "key":
      res = await api(`${base}/settings/key`, { method: "POST", headers });
      break;
    case "test":
      res = await api(`${base}/test`, { method: "POST", headers });
      break;
    default:
      return { ok: false, message: "Unknown action" };
  }

  if (res.ok) {
    return {
      ok: true,
      message: intent === "test" ? "Test notification sent." : "Saved.",
    };
  }
  if (res.status === unreachableStatus) {
    return { ok: false, message: "Backend not reachable" };
  }

  return { ok: false, message: `Failed (${res.status})` };
}

export default function NotificationsSettings({
  loaderData,
}: Route.ComponentProps) {
  const { settings, reachable } = loaderData;
  const { fetcher, busy, intent, toast } = useSubmission();
  const [copied, setCopied] = useState("");

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const hookURL = `${origin}/api/notify-me?key=${settings.hook_key}`;
  const example = `${hookURL}&title=Backup&message=Done`;
  const curl = `curl "${example}"`;

  function send(fields: Record<string, string>) {
    fetcher.submit(fields, { method: "post" });
  }

  async function copy(text: string, note: string) {
    await navigator.clipboard.writeText(text);
    setCopied(note);
  }

  if (!reachable) {
    return (
      <Stack>
        <Block>
          <p className="text-sm text-ui-fg-muted">Backend not reachable.</p>
        </Block>
      </Stack>
    );
  }

  return (
    <Stack>
      <Block title="Your link">
        <p className="text-sm text-ui-fg-muted">
          Anything that can open a URL can notify you with this one. The key is
          part of the link, so treat it like a password.
        </p>
        <code className={codeClass}>{hookURL}</code>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => copy(hookURL, "Link copied.")}
            className={`${buttonClass} inline-flex items-center gap-1.5`}
          >
            <Icon name="copy" className="size-4" />
            Copy
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => send({ intent: "key" })}
            className={dangerButtonClass}
          >
            {busy && intent === "key" ? "Working…" : "New key"}
          </button>
        </div>
      </Block>

      <Block title="With a title and a text">
        <p className="text-sm text-ui-fg-muted">
          Both go in the query. A title is required, the rest is optional —
          <code className="px-1">message</code> and
          <code className="px-1">link</code> are read as well.
        </p>
        <code className={codeClass}>{example}</code>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => copy(example, "Example copied.")}
            className={`${buttonClass} inline-flex items-center gap-1.5`}
          >
            <Icon name="copy" className="size-4" />
            Copy
          </button>
        </div>
      </Block>

      <Block title="From a shell">
        <p className="text-sm text-ui-fg-muted">
          The quotes matter: without them the shell cuts the line at the first
          <code className="px-1">&amp;</code>, and the server only ever sees the
          key.
        </p>
        <code className={codeClass}>{curl}</code>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => copy(curl, "Command copied.")}
            className={`${buttonClass} inline-flex items-center gap-1.5`}
          >
            <Icon name="copy" className="size-4" />
            Copy
          </button>
        </div>
      </Block>

      <Block
        title="Without the key"
        status={
          <span className="ml-auto">
            {settings.hook_enabled ? (
              <Badge tone="bad">Open</Badge>
            ) : (
              <Badge>Key only</Badge>
            )}
          </span>
        }
      >
        <p className="text-sm text-ui-fg-muted">
          On, your user name alone is enough to reach you. Off, only the link
          above works.
        </p>
        <div className="mt-3">
          <PowerSwitch
            on={settings.hook_enabled}
            disabled={busy}
            label="Allow sending without the key"
            onChange={(next) => send({ intent: "hook", enabled: String(next) })}
          />
        </div>
      </Block>

      <Block title="Test">
        <p className="text-sm text-ui-fg-muted">
          Sends one notification to this account.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => send({ intent: "test" })}
          className={`${buttonClass} mt-3`}
        >
          {busy && intent === "test" ? "Sending…" : "Send a test"}
        </button>
      </Block>

      {toast}
      <Toast key={copied} message={copied || null} />
    </Stack>
  );
}
