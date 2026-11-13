import { useEffect, useState } from "react";
import { Form, Link, useNavigation, useSubmit } from "react-router";
import { hashPassword, minPasswordLength } from "../lib/password";
import { CodeInput } from "./code-input";
import { Toast } from "./toast";

const field =
  "h-9 w-full rounded-md border border-ui-border-strong bg-ui-field px-3 text-ui-fg outline-none focus:border-ctp-mauve";

type AuthFormProps = {
  title: string;
  submitLabel: string;
  withConfirm?: boolean;
  twoFactorRequired?: boolean;
  error?: string | null;
  altHref: string;
  altLabel: string;
};

export function AuthForm({
  title,
  submitLabel,
  withConfirm = false,
  twoFactorRequired = false,
  error,
  altHref,
  altLabel,
}: AuthFormProps) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const [hashing, setHashing] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [autoSubmit, setAutoSubmit] = useState(true);
  const busy = hashing || navigation.state !== "idle";

  // one automatic attempt per code; after a rejection the user presses Verify
  useEffect(() => {
    if (error) setAutoSubmit(false);
  }, [error]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setAttempt((n) => n + 1);

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    const password = String(form.get("password") ?? "");

    if (withConfirm && password !== String(form.get("confirm") ?? "")) {
      setMismatch(true);
      return;
    }
    setMismatch(false);

    // the plaintext must not reach the server, so it never goes into the submit
    form.delete("password");
    form.delete("confirm");

    setHashing(true);
    try {
      form.set("passwordHash", await hashPassword(name, password));
    } finally {
      setHashing(false);
    }

    submit(form, { method: "post" });
  }

  return (
    <>
      <h1 className="text-base font-semibold text-ui-fg">{title}</h1>

      <Form
        method="post"
        onSubmit={onSubmit}
        className="mt-5 flex flex-col gap-4"
      >
        <div
          className={twoFactorRequired ? "hidden" : "flex flex-col gap-4"}
          aria-hidden={twoFactorRequired}
        >
          <div className="flex flex-col gap-1">
            <span className="text-sm text-ui-fg-muted">Name</span>
            <input
              type="text"
              name="name"
              aria-label="Name"
              required
              autoComplete="username"
              className={field}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm text-ui-fg-muted">Password</span>
            <input
              type="password"
              name="password"
              aria-label="Password"
              required
              minLength={minPasswordLength}
              autoComplete={withConfirm ? "new-password" : "current-password"}
              className={field}
            />
          </div>

          {withConfirm && (
            <div className="flex flex-col gap-1">
              <span className="text-sm text-ui-fg-muted">Confirm password</span>
              <input
                type="password"
                name="confirm"
                aria-label="Confirm password"
                required
                autoComplete="new-password"
                className={field}
              />
            </div>
          )}
        </div>

        {twoFactorRequired && (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-ui-fg-muted">Two factor code</span>
            <CodeInput name="code" autoSubmit={autoSubmit} disabled={busy} />
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 h-9 cursor-pointer rounded-md bg-ctp-mauve px-4 text-sm font-medium text-ui-frame outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ui-ring disabled:cursor-wait disabled:opacity-60"
        >
          {hashing
            ? "Hashing..."
            : busy
              ? "Please wait..."
              : twoFactorRequired
                ? "Verify"
                : submitLabel}
        </button>
      </Form>

      <Toast
        key={attempt}
        message={mismatch ? "Passwords do not match." : (error ?? null)}
      />

      <p className="mt-5 flex items-center justify-between gap-3 text-sm text-ui-fg-muted">
        <Link to={altHref} className="underline hover:text-ui-fg">
          {altLabel}
        </Link>
        <Link to="/explore" className="underline hover:text-ui-fg">
          Explore
        </Link>
      </p>
    </>
  );
}
