import { useState } from "react";
import { Form, useNavigation, useSubmit } from "react-router";
import type { Route } from "./+types/login";
import { Page } from "../components/page";
import { Panel } from "../components/panel";
import { api } from "../lib/api";
import { hashPassword } from "../lib/password";

export function meta() {
  return [{ title: "Login" }];
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();

  const res = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: form.get("email"),
      passwordHash: form.get("passwordHash"),
    }),
  });

  if (!res.ok) {
    return { error: `Backend responded with ${res.status}` };
  }
  return { error: null };
}

const field =
  "h-9 rounded-md border border-ctp-surface1 bg-ctp-mantle px-3 text-ctp-text outline-none focus:border-ctp-mauve";

export default function Login({ actionData }: Route.ComponentProps) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const [hashing, setHashing] = useState(false);
  const busy = hashing || navigation.state !== "idle";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    // the plaintext must not reach the server, so it never goes into the submit
    form.delete("password");

    setHashing(true);
    try {
      form.set("passwordHash", await hashPassword(password, email));
    } finally {
      setHashing(false);
    }

    submit(form, { method: "post" });
  }

  return (
    <Page title="Login" color="mauve" icon="user">
      <Panel>
        <Form method="post" onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-ctp-subtext0">Email</span>
            <input type="email" name="email" required className={field} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-ctp-subtext0">Password</span>
            <input type="password" name="password" required className={field} />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="mt-2 h-9 cursor-pointer self-start rounded-md bg-ctp-mauve px-4 text-sm font-medium text-ctp-crust outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ctp-overlay0 disabled:cursor-wait disabled:opacity-60"
          >
            {hashing ? "Hashing..." : busy ? "Signing in..." : "Sign in"}
          </button>

          {actionData?.error && (
            <p className="text-sm text-ctp-red">{actionData.error}</p>
          )}
        </Form>
      </Panel>
    </Page>
  );
}
