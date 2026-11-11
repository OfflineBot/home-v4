import { useState } from "react";
import { useRouteLoaderData, useSubmit } from "react-router";
import type { Route } from "./+types/security";
import {
  buttonClass,
  fieldGridClass,
  fieldStackClass,
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
} from "../../components/setting-row";
import { Badge, Block, Stack } from "../../components/block";
import { Toast } from "../../components/toast";
import { api, unreachableStatus } from "../../lib/api";
import { hashPassword, minPasswordLength } from "../../lib/password";
import { readSession } from "../../lib/session";

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const token = await readSession(request.headers.get("Cookie"));
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const paths: Record<string, string> = {
    password: "/api/auth/password",
    setup: "/api/auth/2factor/setup",
    confirm: "/api/auth/2factor/confirm",
    disable: "/api/auth/2factor/disable",
  };
  const path = paths[intent];
  if (!path) return { error: "Unknown action" };

  const body =
    intent === "password"
      ? {
          passwordHash: form.get("passwordHash"),
          newPasswordHash: form.get("newPasswordHash"),
        }
      : {
          passwordHash: form.get("passwordHash"),
          code: form.get("code") ?? "",
        };

  const res = await api(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (res.status === unreachableStatus)
    return { error: "Backend not reachable" };
  if (res.status === 401) return { error: "Wrong password" };
  if (res.status === 409) return { error: "Two factor is already set up" };
  if (res.status === 404) return { error: "Two factor is not set up" };
  if (!res.ok) return { error: `Failed (${res.status})` };

  if (intent === "setup") {
    const data = await res.json();
    return { secret: data.secret as string, uri: data.uri as string };
  }
  return { done: intent };
}

export default function SecuritySettings({ actionData }: Route.ComponentProps) {
  const data = useRouteLoaderData("routes/settings/layout") as
    { me: { name: string; two_factor: boolean } | null } | undefined;
  const me = data?.me;
  const submit = useSubmit();

  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"idle" | "password" | "code">("idle");
  const [held, setHeld] = useState("");
  const [attempt, setAttempt] = useState(0);

  const secret =
    actionData && "secret" in actionData ? actionData.secret : null;
  const error = actionData && "error" in actionData ? actionData.error : null;
  const enabled = me?.two_factor ?? false;

  async function hash(password: string) {
    return hashPassword(me?.name ?? "", password);
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempt((n) => n + 1);

    const form = new FormData(event.currentTarget);
    const current = String(form.get("current") ?? "");
    const next = String(form.get("next") ?? "");

    setBusy(true);
    try {
      const sent = new FormData();
      sent.set("intent", "password");
      sent.set("passwordHash", await hash(current));
      sent.set("newPasswordHash", await hash(next));
      submit(sent, { method: "post" });
      event.currentTarget.reset();
    } finally {
      setBusy(false);
    }
  }

  // the backend wants the password with every two factor change, so it is
  // hashed once and held in memory for the length of the flow
  async function twoFactor(
    event: React.FormEvent<HTMLFormElement>,
    intent: string,
  ) {
    event.preventDefault();
    setAttempt((n) => n + 1);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const code = String(form.get("code") ?? "");

    setBusy(true);
    try {
      const passwordHash = password ? await hash(password) : held;
      setHeld(passwordHash);

      const sent = new FormData();
      sent.set("intent", intent);
      sent.set("passwordHash", passwordHash);
      sent.set("code", code);
      submit(sent, { method: "post" });

      if (intent === "setup") setStep("code");
      if (intent === "confirm" || intent === "disable") {
        setStep("idle");
        setHeld("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack>
        <Block title="Password">
          <form onSubmit={changePassword} className={fieldStackClass}>
            <div className={fieldGridClass}>
              <input
                type="password"
                name="current"
                required
                placeholder="Current password"
                autoComplete="current-password"
                className={inputClass}
              />
              <input
                type="password"
                name="next"
                required
                minLength={minPasswordLength}
                placeholder="New password"
                autoComplete="new-password"
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className={`${primaryButtonClass} self-start`}
            >
              Update
            </button>
          </form>
        </Block>

        <Block
          title="Two factor"
          status={enabled ? <Badge tone="good">On</Badge> : <Badge>Off</Badge>}
        >
          {step === "idle" && (
            <button
              type="button"
              onClick={() => setStep("password")}
              className={enabled ? dangerButtonClass : buttonClass}
            >
              {enabled ? "Disable" : "Enable"}
            </button>
          )}

          {step === "password" && (
            <form
              onSubmit={(e) => twoFactor(e, enabled ? "disable" : "setup")}
              className={fieldStackClass}
            >
              <input
                type="password"
                name="password"
                required
                placeholder="Confirm with your password"
                autoComplete="current-password"
                className={inputClass}
              />
              {enabled && (
                <input
                  name="code"
                  required
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Current 6 digit code"
                  className={inputClass}
                />
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className={enabled ? dangerButtonClass : primaryButtonClass}
                >
                  {enabled ? "Disable" : "Continue"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("idle");
                    setHeld("");
                  }}
                  className={buttonClass}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {step === "code" && (
            <div className={fieldStackClass}>
              {secret && (
                <div className="rounded-md border border-ui-border bg-ui-field p-3">
                  <p className="text-xs text-ui-fg-muted">Secret</p>
                  <code className="mt-1 block font-mono text-sm break-all text-ui-fg">
                    {secret}
                  </code>
                </div>
              )}
              <form
                onSubmit={(e) => twoFactor(e, "confirm")}
                className="flex flex-col gap-2"
              >
                <input
                  name="code"
                  required
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6 digit code"
                  className={inputClass}
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className={`${primaryButtonClass} self-start`}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("idle");
                      setHeld("");
                    }}
                    className={buttonClass}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </Block>
      </Stack>

      <Toast key={attempt} message={error ?? null} />
    </>
  );
}
