import { Link } from "react-router";
import type { Route } from "./+types/register";
import { AuthForm } from "../components/auth-form";
import { api, unreachableStatus } from "../lib/api";

export function meta() {
  return [{ title: "Register" }];
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();

  const res = await api("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: form.get("name"),
      passwordHash: form.get("passwordHash"),
    }),
  });

  if (res.status === 409) {
    return { error: "That name is already taken", done: false };
  }
  if (res.status === unreachableStatus) {
    return { error: "Backend not reachable" };
  }

  if (!res.ok) {
    return { error: "Registration failed", done: false };
  }

  return { error: null, done: true };
}

export default function Register({ actionData }: Route.ComponentProps) {
  if (actionData?.done) {
    return (
      <>
        <h1 className="text-base font-semibold text-ui-fg">Account created</h1>
        <p className="mt-3 text-sm text-ui-fg-muted">
          An admin has to approve it before you can sign in.
        </p>
        <p className="mt-5 text-sm text-ui-fg-muted">
          <Link to="/login" className="underline hover:text-ui-fg">
            Back to sign in
          </Link>
        </p>
      </>
    );
  }

  return (
    <AuthForm
      title="Register"
      submitLabel="Create account"
      withConfirm
      error={actionData?.error}
      altHref="/login"
      altLabel="Already have an account? Sign in"
    />
  );
}
