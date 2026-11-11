import { useEffect, useMemo, useState } from "react";
import { Dialog } from "../dialog";
import { Icon } from "../icons";
import { buttonClass, inputClass, primaryButtonClass } from "../setting-row";
import { NodeIcon } from "./node-icon";
import { Notice } from "./notice";
import { PropertyList } from "./property-fields";
import {
  automationApi,
  credentialIconInfo,
  type Connection,
  type CredentialTest,
  type CredentialTypeDetail,
  type CredentialTypeSummary,
} from "../../lib/automation";
import {
  credentialData,
  credentialDefaults,
  missingRequired,
  rootScope,
  type Values,
} from "../../lib/automation-params";

type ConnectionDialogProps = {
  open: boolean;
  presetType?: string | null;
  editing?: Connection | null;
  onClose: () => void;
  onSaved: (connection: Connection) => void;
};

type Step = "pick" | "form" | "result";

const untestable = /no test|testing function|not.*support.*test|cannot be tested/i;
const listLimit = 120;

export function ConnectionDialog({ open, presetType, editing, onClose, onSaved }: ConnectionDialogProps) {
  const [step, setStep] = useState<Step>("pick");
  const [types, setTypes] = useState<CredentialTypeSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<CredentialTypeDetail | null>(null);
  const [name, setName] = useState("");
  const [values, setValues] = useState<Values>({});
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState<Connection | null>(null);
  const [test, setTest] = useState<CredentialTest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setStep(editing || presetType ? "form" : "pick");
    setQuery("");
    setDetail(null);
    setSaved(editing ?? null);
    setTest(null);
    setError(null);
    setTouched(false);
    setName(editing?.name ?? "");

    const type = editing?.type ?? presetType;
    if (type) loadType(type);
    else if (!types) {
      automationApi.credentialTypes().then((result) => {
        if (result.ok) setTypes(result.data.types);
        else setError(result.message);
      });
    }
  }, [open, presetType, editing]);

  async function loadType(type: string) {
    setBusy(true);
    setError(null);
    const result = await automationApi.credentialType(type);
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setDetail(result.data);
    setValues(credentialDefaults(result.data.properties));
    setName((current) => current || result.data.display_name);
    setStep("form");
  }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (types ?? [])
      .filter((type) => !type.oauth)
      .filter(
        (type) =>
          !term ||
          type.display_name.toLowerCase().includes(term) ||
          type.name.toLowerCase().includes(term),
      );
  }, [types, query]);

  const oauthCount = (types ?? []).filter((type) => type.oauth).length;

  async function save() {
    if (!detail) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the connection a name.");
      return;
    }

    const replacing = !saved || touched;
    if (replacing) {
      const missing = missingRequired(detail.properties, values);
      if (missing.length > 0) {
        setError(`Fill in: ${missing.join(", ")}`);
        return;
      }
    }

    setBusy(true);
    setError(null);

    const data = credentialData(detail.properties, values);
    const result = saved
      ? await automationApi.updateConnection(saved.id, {
          name: trimmed,
          ...(replacing ? { data } : {}),
        })
      : await automationApi.createConnection(trimmed, detail.name, data);

    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      return;
    }

    setSaved(result.data);
    onSaved(result.data);

    const checked = await automationApi.testConnection(result.data.id);
    setBusy(false);
    setTest(checked.ok ? checked.data : { ok: false, message: checked.message });
    setStep("result");
  }

  const title =
    step === "pick"
      ? "Add connection"
      : saved
        ? `Edit ${saved.name}`
        : `New ${detail?.display_name ?? "connection"}`;

  return (
    <Dialog open={open} title={title} onClose={onClose}>
      {step === "pick" && (
        <div className="flex flex-col gap-3">
          <input
            autoFocus
            className={inputClass}
            placeholder="Search services, e.g. Discord, Telegram, SMTP"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {error && <Notice tone="bad">{error}</Notice>}
          {!types && !error && <p className="text-sm text-ui-fg-muted">Loading services…</p>}
          {types && (
            <ul className="-mx-1 flex max-h-80 flex-col overflow-y-auto">
              {filtered.slice(0, listLimit).map((type) => (
                <li key={type.name}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => loadType(type.name)}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left outline-none hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring disabled:opacity-50"
                  >
                    <NodeIcon info={credentialIconInfo(type)} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ui-fg">{type.display_name}</span>
                    <Icon name="chevron" className="size-4 text-ui-fg-faint" />
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-2 py-2 text-sm text-ui-fg-muted">No service matches.</li>
              )}
            </ul>
          )}
          {types && (
            <p className="text-xs text-ui-fg-faint">
              {filtered.length > listLimit
                ? `Showing ${listLimit} of ${filtered.length}. Keep typing to narrow it down. `
                : ""}
              {oauthCount > 0 && `${oauthCount} OAuth logins are hidden, they are not supported yet.`}
            </p>
          )}
        </div>
      )}

      {step === "form" && (
        <div className="flex flex-col gap-4">
          {!detail && !error && <p className="text-sm text-ui-fg-muted">Loading fields…</p>}
          {error && <Notice tone="bad">{error}</Notice>}
          {detail && (
            <>
              <div className="flex items-center gap-3">
                <NodeIcon info={credentialIconInfo(detail)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ui-fg">{detail.display_name}</p>
                  {detail.documentation_url && (
                    <a
                      href={detail.documentation_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-ctp-mauve hover:underline"
                    >
                      How to get these values
                    </a>
                  )}
                </div>
                {!editing && !presetType && (
                  <button type="button" className={buttonClass} onClick={() => setStep("pick")}>
                    Back
                  </button>
                )}
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-ui-fg-muted">Name</span>
                <input
                  className={inputClass}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="off"
                />
              </label>

              {saved && !touched && (
                <Notice>
                  Saved values stay hidden. Change only the name, or fill in the fields to replace them.
                </Notice>
              )}

              <PropertyList
                properties={detail.properties}
                values={values}
                scope={rootScope(detail.properties, values, 1)}
                expressions={false}
                onChange={(next) => {
                  setValues(next);
                  setTouched(true);
                }}
              />

              <div className="flex justify-end gap-2">
                <button type="button" className={buttonClass} onClick={onClose}>
                  Cancel
                </button>
                <button type="button" className={primaryButtonClass} disabled={busy} onClick={save}>
                  {busy ? "Saving and testing…" : "Save and test"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === "result" && saved && (
        <div className="flex flex-col gap-4">
          {test?.ok ? (
            <Notice tone="good">Connection works. "{saved.name}" is ready to use.</Notice>
          ) : test && untestable.test(test.message) ? (
            <Notice>Saved. n8n has no automatic test for this service, it is checked on the first run.</Notice>
          ) : (
            <Notice tone="bad">
              Saved, but the test failed: {test?.message || "no answer from the service."}
            </Notice>
          )}
          <div className="flex justify-end gap-2">
            {!test?.ok && (
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  setStep("form");
                  setTest(null);
                  if (detail) setValues(credentialDefaults(detail.properties));
                  setTouched(false);
                }}
              >
                Fix values
              </button>
            )}
            <button type="button" className={primaryButtonClass} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
