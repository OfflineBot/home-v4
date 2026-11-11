import { useState } from "react";
import { useRevalidator } from "react-router";
import type { Route } from "./+types/git.tokens";
import { Block, Stack } from "../components/block";
import { Dialog } from "../components/dialog";
import { Ago, CopyButton } from "../components/git/parts";
import { Icon } from "../components/icons";
import { Page } from "../components/page";
import { Field, buttonClass, dangerButtonClass, inputClass, primaryButtonClass } from "../components/setting-row";
import { Toast } from "../components/toast";
import { gitApi, type GitToken } from "../lib/git";
import { listTokens } from "../lib/git.server";
import { navColor } from "../lib/nav";
import { requireToken } from "../lib/session";

export function meta() {
  return [{ title: "Tokens · Git" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const tokens = await listTokens(token);
  return { tokens: tokens ?? [], failed: tokens === null };
}

export default function Tokens({ loaderData }: Route.ComponentProps) {
  const { tokens, failed } = loaderData;
  const revalidator = useRevalidator();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [removing, setRemoving] = useState<GitToken | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState({ message: "", attempt: 0 });

  function fail(error: unknown) {
    setFailure((current) => ({ message: error instanceof Error ? error.message : "Failed.", attempt: current.attempt + 1 }));
  }

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const result = await gitApi.createToken(name.trim());
      setCreating(false);
      setName("");
      setCreated(result.token);
      void revalidator.revalidate();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  async function remove(token: GitToken) {
    setBusy(true);
    try {
      await gitApi.deleteToken(token.id);
      setRemoving(null);
      void revalidator.revalidate();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      title="Git tokens"
      icon="security"
      color={navColor("git")}
      back={{ to: "/git", label: "Git" }}
      actions={
        <button type="button" onClick={() => setCreating(true)} className={`${primaryButtonClass} inline-flex items-center gap-1.5`}>
          <Icon name="plus" className="size-4" />
          New token
        </button>
      }
    >
      <Stack>
        {created && (
          <section className="flex flex-col gap-3 rounded-xl border border-[color-mix(in_oklab,var(--ctp-green)_45%,transparent)] bg-[color-mix(in_oklab,var(--ctp-green)_8%,transparent)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ui-fg">
              <Icon name="check" className="size-4 text-ctp-green" />
              Token created
            </div>
            <div className="flex min-w-0 items-center gap-1 rounded-lg border border-ui-border bg-ui-field pl-3">
              <code className="min-w-0 flex-1 truncate py-2 font-mono text-sm text-ui-fg">{created}</code>
              <CopyButton text={created} label="Copy token" />
            </div>
            <p className="text-sm text-ui-fg">Copy it now. It is shown only once.</p>
            <button type="button" onClick={() => setCreated(null)} className={`${buttonClass} w-fit`}>
              Done
            </button>
          </section>
        )}

        {failed ? (
          <Block>
            <p className="text-sm text-ui-danger">Tokens could not be loaded.</p>
          </Block>
        ) : tokens.length === 0 ? (
          <Block>
            <p className="text-sm text-ui-fg-muted">No tokens yet.</p>
          </Block>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-ui-border bg-ui-raised">
            {tokens.map((token) => (
              <li key={token.id} className="flex flex-wrap items-center gap-3 border-b border-ui-border-soft/60 px-4 py-3 last:border-b-0">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent)]">
                  <Icon name="security" className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ui-fg">{token.name}</p>
                  <p className="truncate text-xs text-ui-fg-muted">
                    <span className="font-mono">{token.prefix}…</span> · created <Ago date={token.created_at} /> ·{" "}
                    {token.last_used_at ? (
                      <>
                        used <Ago date={token.last_used_at} />
                      </>
                    ) : (
                      "never used"
                    )}
                  </p>
                </div>
                <button type="button" onClick={() => setRemoving(token)} className={dangerButtonClass}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </Stack>

      <Dialog open={creating} title="New token" onClose={() => setCreating(false)}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Name">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={64}
              autoComplete="off"
              className={inputClass}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreating(false)} className={buttonClass}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !name.trim()} className={primaryButtonClass}>
              {busy ? "Creating…" : "Create token"}
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog open={removing !== null} title="Revoke token?" onClose={() => setRemoving(null)}>
        {removing && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ui-fg">
              <strong className="font-semibold">{removing.name}</strong> stops working immediately.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRemoving(null)} className={buttonClass}>
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={() => void remove(removing)} className={dangerButtonClass}>
                {busy ? "Revoking…" : "Revoke"}
              </button>
            </div>
          </div>
        )}
      </Dialog>
      <Toast key={failure.attempt} message={failure.attempt > 0 ? failure.message : null} />
    </Page>
  );
}
