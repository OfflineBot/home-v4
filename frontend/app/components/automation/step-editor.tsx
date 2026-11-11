import { useEffect, useState } from "react";
import { ExpandableBlock } from "../block";
import { Icon } from "../icons";
import { inputClass, textareaClass } from "../setting-row";
import { NodeIcon } from "./node-icon";
import { Notice, selectClass, smallButtonClass } from "./notice";
import { OptionsContext, PropertyList, Toggle, type OptionsLoader } from "./property-fields";
import {
  automationApi,
  descriptionIconInfo,
  docsLink,
  homeCredentialType,
  isHomeNode,
  webhookType,
  type Connection,
  type CredentialTypeSummary,
  type NodeDescription,
  type WorkflowNode,
} from "../../lib/automation";
import { nodeCredentials, normalizeParameters, rootScope } from "../../lib/automation-params";

type StepEditorProps = {
  node: WorkflowNode;
  description: NodeDescription | undefined;
  first: boolean;
  connections: Connection[];
  nameTaken: (name: string) => boolean;
  onChange: (change: (node: WorkflowNode) => WorkflowNode) => void;
  onRename: (name: string) => void;
  onNewConnection: (type: string, slot: string) => void;
};

const homeOptions: OptionsLoader = async (method, root) => {
  const result = await automationApi.homeOptions(method, {
    light: root.light === undefined || root.light === "" ? "" : String(root.light),
  });
  return result.ok ? result.data.options : null;
};

const errorModes = [
  { value: "stopWorkflow", label: "Stop the workflow" },
  { value: "continueRegularOutput", label: "Continue" },
  { value: "continueErrorOutput", label: "Continue with error output" },
];

export function StepEditor({
  node,
  description,
  first,
  connections,
  nameTaken,
  onChange,
  onRename,
  onNewConnection,
}: StepEditorProps) {
  const [draftName, setDraftName] = useState(node.name);
  const [credentialTypes, setCredentialTypes] = useState<Record<string, CredentialTypeSummary>>({});

  useEffect(() => setDraftName(node.name), [node.id, node.name]);

  useEffect(() => {
    automationApi.credentialTypes().then((result) => {
      if (!result.ok) return;
      setCredentialTypes(Object.fromEntries(result.data.types.map((type) => [type.name, type])));
    });
  }, []);

  if (!description) {
    return (
      <Notice tone="bad">
        n8n does not know this step type ({node.type} v{node.typeVersion}). Edit it in the JSON tab.
      </Notice>
    );
  }

  const params = node.parameters ?? {};
  const scope = rootScope(description.properties, params, node.typeVersion);
  const main = description.properties.filter((property) => !property.isNodeSetting);
  const settings = description.properties.filter((property) => property.isNodeSetting);
  const slots = nodeCredentials(description, params, node.typeVersion);
  const docs = docsLink(description);
  const trimmed = draftName.trim();
  const nameError =
    trimmed === "" ? "A name is required." : trimmed !== node.name && nameTaken(trimmed) ? "Another step already uses this name." : null;

  const setParams = (next: Record<string, unknown>) =>
    onChange((current) => ({
      ...current,
      parameters: normalizeParameters(description.properties, next, current.typeVersion),
    }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <NodeIcon info={descriptionIconInfo(description)} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ui-fg">{description.displayName}</p>
          {description.description && (
            <p className="line-clamp-2 text-xs text-ui-fg-muted">{description.description}</p>
          )}
          {docs && (
            <a href={docs} target="_blank" rel="noreferrer" className="text-xs text-ctp-mauve hover:underline">
              n8n docs
            </a>
          )}
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-ui-fg-muted">
          Enabled
          <Toggle
            checked={!node.disabled}
            label="Enabled"
            onChange={(enabled) => onChange((current) => ({ ...current, disabled: !enabled || undefined }))}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-ui-fg-muted">Step name</span>
        <input
          className={inputClass}
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={() => {
            if (!nameError && trimmed !== node.name) onRename(trimmed);
            else setDraftName(node.name);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          }}
        />
        {nameError && trimmed !== node.name && <span className="text-xs text-ui-danger">{nameError}</span>}
      </label>

      {node.type === webhookType && (
        <Notice>
          n8n stays private on this server, so this webhook is not reachable from the internet. Activate the workflow and press Run at the top to call it. The data you send is available as {"{{ $json.body }}"}.
        </Notice>
      )}

      {!first && (
        <p className="text-xs text-ui-fg-faint">
          Tip: write {"{{ $json.field }}"} in a text field to use data from the step before.
        </p>
      )}

      {slots.map((slot) => {
        if (slot.name === homeCredentialType) {
          return (
            <Notice key={slot.name}>
              This home component uses your home-v4 account automatically. No connection needed.
            </Notice>
          );
        }
        const type = credentialTypes[slot.name];
        const options = connections.filter((connection) => connection.type === slot.name);
        const current = node.credentials?.[slot.name]?.id ?? "";
        const missing = current !== "" && !options.some((option) => option.id === current);

        return (
          <div key={slot.name} className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ui-fg-muted">
              Connection · {type?.display_name ?? slot.name}
              {slot.required !== false && <span className="text-ui-danger"> *</span>}
            </span>
            {type?.oauth ? (
              <Notice tone="warn">This sign-in uses OAuth, which is not supported yet. Pick another authentication above if the service offers one.</Notice>
            ) : (
              <div className="flex gap-2">
                <select
                  className={selectClass}
                  value={missing ? "" : current}
                  aria-label={`Connection for ${node.name}`}
                  onChange={(event) => {
                    const chosen = options.find((option) => option.id === event.target.value);
                    onChange((step) => {
                      const credentials = { ...(step.credentials ?? {}) };
                      if (chosen) credentials[slot.name] = { id: chosen.id, name: chosen.name };
                      else delete credentials[slot.name];
                      return { ...step, credentials: Object.keys(credentials).length ? credentials : undefined };
                    });
                  }}
                >
                  <option value="">{options.length ? "Choose a connection…" : "No connection yet"}</option>
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <button type="button" className={`${smallButtonClass} h-9!`} onClick={() => onNewConnection(slot.name, slot.name)}>
                  <Icon name="plus" className="size-3.5" />
                  New
                </button>
              </div>
            )}
            {missing && <span className="text-xs text-ui-danger">The selected connection was removed.</span>}
          </div>
        );
      })}

      <OptionsContext.Provider value={isHomeNode(node.type) ? homeOptions : null}>
        <PropertyList
          properties={main}
          values={params}
          scope={scope}
          expressions
          onChange={setParams}
        />
      </OptionsContext.Provider>

      <ExpandableBlock title="Step settings" icon="settings" color="overlay2" summary={null}>
        <div className="flex flex-col gap-4">
          <PropertyList properties={settings} values={params} scope={scope} expressions onChange={setParams} />

          <SettingSwitch
            label="Always output data"
            hint="Pass an empty item on when this step returns nothing."
            checked={node.alwaysOutputData === true}
            onChange={(value) => onChange((step) => ({ ...step, alwaysOutputData: value || undefined }))}
          />
          <SettingSwitch
            label="Execute once"
            hint="Only use the first item instead of running once per item."
            checked={node.executeOnce === true}
            onChange={(value) => onChange((step) => ({ ...step, executeOnce: value || undefined }))}
          />
          <SettingSwitch
            label="Retry on fail"
            checked={node.retryOnFail === true}
            onChange={(value) => onChange((step) => ({ ...step, retryOnFail: value || undefined }))}
          />
          {node.retryOnFail && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-ui-fg-muted">Max tries</span>
                <input
                  type="number"
                  min={2}
                  max={10}
                  className={inputClass}
                  value={node.maxTries ?? 3}
                  onChange={(event) => onChange((step) => ({ ...step, maxTries: Number(event.target.value) || undefined }))}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-ui-fg-muted">Wait between tries (ms)</span>
                <input
                  type="number"
                  min={0}
                  max={60000}
                  step={100}
                  className={inputClass}
                  value={node.waitBetweenTries ?? 1000}
                  onChange={(event) =>
                    onChange((step) => ({ ...step, waitBetweenTries: Number(event.target.value) || undefined }))
                  }
                />
              </label>
            </div>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ui-fg-muted">On error</span>
            <select
              className={selectClass}
              value={node.onError ?? "stopWorkflow"}
              onChange={(event) =>
                onChange((step) => ({
                  ...step,
                  onError: event.target.value === "stopWorkflow" ? undefined : event.target.value,
                }))
              }
            >
              {errorModes.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ui-fg-muted">Notes</span>
            <textarea
              className={textareaClass}
              value={node.notes ?? ""}
              onChange={(event) => onChange((step) => ({ ...step, notes: event.target.value || undefined }))}
            />
          </label>
        </div>
      </ExpandableBlock>
    </div>
  );
}

function SettingSwitch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-ui-fg">{label}</p>
        {hint && <p className="text-xs text-ui-fg-faint">{hint}</p>}
      </div>
      <Toggle checked={checked} label={label} onChange={onChange} />
    </div>
  );
}
