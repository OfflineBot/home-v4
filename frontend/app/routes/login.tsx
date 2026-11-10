import { Form } from "react-router";
import type { Route } from "./+types/login";
import { api } from "../lib/api";

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
      password: form.get("password"),
    }),
  });

  if (!res.ok) {
    return { error: `Backend responded with ${res.status}` };
  }
  return { error: null };
}

export default function Login({ actionData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold text-ctp-mauve">Login</h1>

      <Form method="post" className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-ctp-subtext0">Email</span>
          <input
            type="email"
            name="email"
            required
            className="rounded-md border border-ctp-surface1 bg-ctp-mantle px-3 py-2 outline-none focus:border-ctp-mauve"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-ctp-subtext0">Password</span>
          <input
            type="password"
            name="password"
            required
            className="rounded-md border border-ctp-surface1 bg-ctp-mantle px-3 py-2 outline-none focus:border-ctp-mauve"
          />
        </label>

        <button
          type="submit"
          className="mt-2 rounded-md bg-ctp-mauve px-4 py-2 font-medium text-ctp-crust hover:opacity-90"
        >
          Sign in
        </button>
      </Form>

      {actionData?.error && (
        <p className="mt-4 text-sm text-ctp-red">{actionData.error}</p>
      )}
    </main>
  );
}
