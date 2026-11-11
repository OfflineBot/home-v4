import { redirect } from "react-router";
import type { Route } from "./+types/login";
import { AuthForm } from "../components/auth-form";
import { api, unreachableStatus } from "../lib/api";
import { sessionCookie } from "../lib/session";

export function meta() {
  return [{ title: "Login" }];
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();

  const res = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: form.get("name"),
      passwordHash: form.get("passwordHash"),
      code: form.get("code"),
    }),
  });

  if (res.status === unreachableStatus) {
    return { error: "Backend not reachable" };
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);

    if (data?.two_factor_required) {
      // not an error on the first step: the form switches to asking for a code
      return {
        twoFactorRequired: true,
        error: data.invalid_code ? "Wrong code" : null,
      };
    }
    if (data?.not_approved) {
      return { error: "An admin has to approve this account first" };
    }
    if (res.status === 423) {
      return { error: "Account locked, an admin has to unlock it" };
    }
    if (res.status === 429) {
      return { error: "Too many attempts, try again later" };
    }

    return { error: "Wrong name or password" };
  }

  const { token, expires_at } = await res.json();

  return redirect("/", {
    headers: {
      "Set-Cookie": await sessionCookie.serialize(token, {
        expires: new Date(expires_at),
      }),
    },
  });
}

export default function Login({ actionData }: Route.ComponentProps) {
  return (
    <AuthForm
      title="Sign in"
      submitLabel="Sign in"
      twoFactorRequired={actionData?.twoFactorRequired}
      error={actionData?.error}
      altHref="/register"
      altLabel="No account yet? Register"
    />
  );
}
