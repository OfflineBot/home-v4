import { createContext, useContext, useEffect, useId, useState, type ReactNode } from "react";
import { Icon } from "../icons";
import { inputClass } from "../setting-row";
import {
  codeAreaClass,
  iconButtonClass,
  Notice,
  selectClass,
  smallButtonClass,
} from "./notice";
import { newId, type NodeProperty, type PropertyOption } from "../../lib/automation";
import {
  assignmentTypes,
  childScope,
  choiceOptions,
  clone,
  collectionGroups,
  collectionOptions,
  filterOperators,
  fromText,
  initialValue,
  isDynamic,
  isExpression,
  isPassword,
  locatorModes,
  multiline,
  noticeText,
  numberLimits,
  operatorKey,
  readAssignments,
  readFilter,
  skippedTypes,
  toText,
  unsupportedTypes,
  valueOf,
  visibleProperties,
  type Assignment,
  type FilterCondition,
  type Scope,
  type Values,
} from "../../lib/automation-params";

export type OptionsLoader = (method: string, root: Values) => Promise<PropertyOption[] | null>;

export const OptionsContext = createContext<OptionsLoader | null>(null);

type ListProps = {
  properties: NodeProperty[];
  values: Values;
  scope: Scope;
  expressions: boolean;
  onChange: (next: Values) => void;
};

function withKey(values: Values, key: string, value: unknown) {
  const next = { ...values };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

export function PropertyList({ properties, values, scope, expressions, onChange }: ListProps) {
  const visible = visibleProperties(properties, scope).filter(
    (property) => !skippedTypes.has(property.type),
  );

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {visible.map((property) => (
        <PropertyField
          key={property.name}
          property={property}
          value={valueOf(property, values)}
          scope={scope}
          expressions={expressions}
          onChange={(value) => onChange(withKey(values, property.name, value))}
        />
      ))}
    </div>
  );
}

type FieldProps = {
  property: NodeProperty;
  value: unknown;
  scope: Scope;
  expressions: boolean;
  onChange: (value: unknown) => void;
  onRemove?: () => void;
};

const toggleable = new Set(["number", "boolean", "options", "multiOptions", "dateTime", "color"]);

export function PropertyField(props: FieldProps) {
  const { property, value, expressions, onChange, onRemove } = props;
  const id = useId();

  if (property.type === "notice" || property.type === "callout") {
    return <Notice>{noticeText(property.displayName)}</Notice>;
  }

  const allowExpression = expressions && !property.noDataExpression;
  const expression = allowExpression && isExpression(value);
  const canToggle = allowExpression && toggleable.has(property.type);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-h-5 items-center gap-2">
        <label htmlFor={id} className="min-w-0 truncate text-xs font-medium text-ui-fg-muted">
          {property.displayName}
          {property.required && <span className="text-ui-danger"> *</span>}
        </label>
        {expression && <ExpressionBadge />}
        <span className="ml-auto flex items-center gap-1">
          {canToggle && (
            <button
              type="button"
              className={iconButtonClass}
              title={expression ? "Use a fixed value" : "Use an expression"}
              aria-label={expression ? "Use a fixed value" : "Use an expression"}
              onClick={() =>
                onChange(expression ? clone(property.default) : `=${toText(value)}`)
              }
            >
              <span className="font-mono text-[10px]">{expression ? "abc" : "fx"}</span>
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              className={iconButtonClass}
              title="Remove"
              aria-label={`Remove ${property.displayName}`}
              onClick={onRemove}
            >
              <Icon name="close" className="size-3.5" />
            </button>
          )}
        </span>
      </div>

      {expression ? (
        <TextControl
          id={id}
          value={value}
          multi={false}
          placeholder="{{ $json.field }}"
          allowExpression
          forceExpression
          onChange={onChange}
        />
      ) : (
        <Control {...props} id={id} allowExpression={allowExpression} />
      )}

      <FieldHint property={property} />
    </div>
  );
}

function ExpressionBadge() {
  return (
    <span className="rounded border border-ui-border-soft px-1 font-mono text-[10px] text-ctp-mauve">
      fx
    </span>
  );
}

function FieldHint({ property }: { property: NodeProperty }) {
  const text = property.hint || property.description;
  if (!text) return null;

  return <p className="line-clamp-2 text-xs text-ui-fg-faint">{noticeText(text)}</p>;
}

type ControlProps = FieldProps & { id: string; allowExpression: boolean };

function Control(props: ControlProps) {
  const { property, value, onChange, id, allowExpression } = props;
  const loader = useContext(OptionsContext);

  if (unsupportedTypes.has(property.type)) {
    return <Notice>This field can only be edited in the JSON tab.</Notice>;
  }

  switch (property.type) {
    case "string":
      return (
        <TextControl
          id={id}
          value={value}
          multi={multiline(property)}
          password={isPassword(property)}
          placeholder={property.placeholder}
          allowExpression={allowExpression}
          onChange={onChange}
        />
      );
    case "number":
      return <NumberControl id={id} property={property} value={value} onChange={onChange} />;
    case "boolean":
      return <Toggle id={id} checked={value === true} onChange={onChange} />;
    case "options":
      if (isDynamic(property) && loader && property.typeOptions?.loadOptionsMethod) {
        return <DynamicSelect {...props} loader={loader} />;
      }
      return isDynamic(property) ? (
        <DynamicHint>
          <TextControl id={id} value={value} multi={false} allowExpression={allowExpression} onChange={onChange} />
        </DynamicHint>
      ) : (
        <SelectControl id={id} options={choiceOptions(property)} value={value} onChange={onChange} />
      );
    case "multiOptions":
      return isDynamic(property) ? (
        <DynamicHint>
          <input
            id={id}
            className={inputClass}
            value={Array.isArray(value) ? value.join(", ") : toText(value)}
            placeholder="value1, value2"
            onChange={(event) =>
              onChange(
                event.target.value
                  .split(",")
                  .map((part) => part.trim())
                  .filter(Boolean),
              )
            }
          />
        </DynamicHint>
      ) : (
        <MultiControl property={property} value={value} onChange={onChange} />
      );
    case "dateTime":
      return (
        <input
          id={id}
          type="datetime-local"
          className={inputClass}
          value={typeof value === "string" ? value.slice(0, 16) : ""}
          onChange={(event) => onChange(event.target.value || undefined)}
        />
      );
    case "color":
      return (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={property.displayName}
            className="h-9 w-12 cursor-pointer rounded-md border border-ui-border-strong bg-ui-field"
            value={typeof value === "string" && value.startsWith("#") ? value : "#000000"}
            onChange={(event) => onChange(event.target.value)}
          />
          <input
            id={id}
            className={`${inputClass} font-mono`}
            value={toText(value)}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      );
    case "json":
      return (
        <textarea
          id={id}
          className={codeAreaClass}
          spellCheck={false}
          value={typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2)}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "collection":
      return <CollectionControl {...props} />;
    case "fixedCollection":
      return <FixedCollectionControl {...props} />;
    case "resourceLocator":
      return <LocatorControl {...props} />;
    case "assignmentCollection":
      return <AssignmentControl value={value} onChange={onChange} />;
    case "filter":
      return <FilterControl value={value} version={props.scope.version} onChange={onChange} />;
  }

  return (
    <TextControl id={id} value={value} multi={false} allowExpression={allowExpression} onChange={onChange} />
  );
}

function DynamicHint({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      {children}
      <p className="text-xs text-ui-fg-faint">
        n8n loads this list live from the service. Enter the value or ID directly.
      </p>
    </div>
  );
}

type TextControlProps = {
  id: string;
  value: unknown;
  multi: boolean;
  password?: boolean;
  placeholder?: string;
  allowExpression: boolean;
  forceExpression?: boolean;
  onChange: (value: unknown) => void;
};

function TextControl({ id, value, multi, password, placeholder, allowExpression, forceExpression, onChange }: TextControlProps) {
  const text = toText(value);
  const change = (next: string) =>
    onChange(forceExpression ? `=${next}` : fromText(next, allowExpression));

  if (multi || text.includes("\n")) {
    return (
      <textarea
        id={id}
        className={codeAreaClass}
        value={text}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => change(event.target.value)}
      />
    );
  }

  return (
    <input
      id={id}
      className={inputClass}
      type={password ? "password" : "text"}
      autoComplete={password ? "new-password" : "off"}
      spellCheck={false}
      value={text}
      placeholder={placeholder}
      onChange={(event) => change(event.target.value)}
    />
  );
}

function NumberControl({ id, property, value, onChange }: { id: string; property: NodeProperty; value: unknown; onChange: (value: unknown) => void }) {
  const limits = numberLimits(property);

  return (
    <input
      id={id}
      type="number"
      className={inputClass}
      min={limits.min}
      max={limits.max}
      step={limits.step}
      value={typeof value === "number" && Number.isFinite(value) ? value : ""}
      onChange={(event) =>
        onChange(event.target.value === "" ? undefined : Number(event.target.value))
      }
    />
  );
}

export function Toggle({ id, checked, onChange, label }: { id?: string; checked: boolean; onChange: (value: boolean) => void; label?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none ${
        checked ? "border-ctp-mauve bg-ctp-mauve" : "border-ui-border-strong bg-ui-field"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-3.5 rounded-full transition-transform motion-reduce:transition-none ${
          checked ? "translate-x-4 bg-ui-frame" : "bg-ui-fg-muted"
        }`}
      />
    </button>
  );
}

function DynamicSelect({ property, value, scope, onChange, id, loader }: ControlProps & { loader: OptionsLoader }) {
  const method = String(property.typeOptions?.loadOptionsMethod ?? "");
  const depends = Array.isArray(property.typeOptions?.loadOptionsDependsOn)
    ? (property.typeOptions.loadOptionsDependsOn as string[])
    : [];
  const key = depends.map((name) => JSON.stringify(scope.root[name] ?? scope.values[name] ?? "")).join("|");
  const [options, setOptions] = useState<PropertyOption[] | null | "failed">(null);

  useEffect(() => {
    let active = true;
    setOptions(null);
    loader(method, scope.root).then((result) => {
      if (active) setOptions(result ?? "failed");
    });
    return () => {
      active = false;
    };
  }, [method, key]);

  useEffect(() => {
    const empty = value === undefined || value === null || value === "";
    if (Array.isArray(options) && options.length === 1 && property.required && empty) {
      onChange(options[0].value);
    }
  }, [options]);

  if (options === "failed") {
    return (
      <DynamicHint>
        <TextControl id={id} value={value} multi={false} allowExpression onChange={onChange} />
      </DynamicHint>
    );
  }
  if (options === null) {
    return (
      <select id={id} className={selectClass} disabled>
        <option>Loading…</option>
      </select>
    );
  }
  if (options.length === 0) {
    return <Notice tone="warn">Nothing to choose yet. {property.description ?? ""}</Notice>;
  }

  return <SelectControl id={id} options={options} value={value} onChange={onChange} />;
}

function SelectControl({ id, options, value, onChange }: { id: string; options: PropertyOption[]; value: unknown; onChange: (value: unknown) => void }) {
  const index = options.findIndex((option) => JSON.stringify(option.value) === JSON.stringify(value));
  const selected = options[index];

  return (
    <div className="flex flex-col gap-1">
      <select
        id={id}
        className={selectClass}
        value={index === -1 ? "custom" : String(index)}
        onChange={(event) => {
          const option = options[Number(event.target.value)];
          if (option) onChange(option.value);
        }}
      >
        {index === -1 && (
          <option value="custom" disabled>
            {value === undefined || value === "" ? "Choose…" : `Custom: ${toText(value)}`}
          </option>
        )}
        {options.map((option, position) => (
          <option key={position} value={String(position)}>
            {option.name}
          </option>
        ))}
      </select>
      {selected?.description && (
        <p className="line-clamp-2 text-xs text-ui-fg-faint">{noticeText(selected.description)}</p>
      )}
    </div>
  );
}

function MultiControl({ property, value, onChange }: { property: NodeProperty; value: unknown; onChange: (value: unknown) => void }) {
  const options = choiceOptions(property);
  const current = Array.isArray(value) ? value : [];

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option, index) => {
        const active = current.some((item) => JSON.stringify(item) === JSON.stringify(option.value));
        return (
          <button
            key={index}
            type="button"
            aria-pressed={active}
            onClick={() =>
              onChange(
                active
                  ? current.filter((item) => JSON.stringify(item) !== JSON.stringify(option.value))
                  : [...current, option.value],
              )
            }
            className={`h-7 cursor-pointer rounded-full border px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ui-ring ${
              active
                ? "border-ctp-mauve bg-[color-mix(in_oklab,var(--ctp-mauve)_18%,transparent)] text-ui-fg"
                : "border-ui-border text-ui-fg-muted hover:bg-ui-hover"
            }`}
          >
            {option.name}
          </button>
        );
      })}
    </div>
  );
}

function objectValue(value: unknown): Values {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Values) : {};
}

function CollectionControl({ property, value, scope, expressions, onChange }: ControlProps) {
  const current = objectValue(value);
  const options = collectionOptions(property);
  const inner = childScope(scope, options, current);
  const visible = visibleProperties(options, inner).filter((option) => !skippedTypes.has(option.type));
  const used = visible.filter((option) => option.name in current);
  const available = visible.filter((option) => !(option.name in current) && option.type !== "notice");

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-ui-border-soft bg-ui-surface p-3">
      {used.map((option) => (
        <PropertyField
          key={option.name}
          property={option}
          value={current[option.name]}
          scope={inner}
          expressions={expressions}
          onChange={(next) => onChange(withKey(current, option.name, next))}
          onRemove={() => onChange(withKey(current, option.name, undefined))}
        />
      ))}
      {available.length > 0 ? (
        <select
          aria-label={`Add to ${property.displayName}`}
          className={`${selectClass} text-ui-fg-muted`}
          value=""
          onChange={(event) => {
            const option = available.find((entry) => entry.name === event.target.value);
            if (option) onChange(withKey(current, option.name, initialValue(option) ?? ""));
          }}
        >
          <option value="" disabled>
            {property.placeholder || "Add option"}
          </option>
          {available.map((option) => (
            <option key={option.name} value={option.name}>
              {option.displayName}
            </option>
          ))}
        </select>
      ) : (
        used.length === 0 && <p className="text-xs text-ui-fg-faint">No options available.</p>
      )}
    </div>
  );
}

function groupDefaults(values: NodeProperty[]) {
  const entry: Values = {};
  for (const property of values) {
    if (property.name in entry || property.type === "notice") continue;
    const initial = initialValue(property);
    if (initial !== undefined) entry[property.name] = initial;
  }
  return entry;
}

function FixedCollectionControl({ property, value, scope, expressions, onChange }: ControlProps) {
  const current = objectValue(value);
  const groups = collectionGroups(property);
  const multiple = Boolean(property.typeOptions?.multipleValues);
  const buttonText = property.typeOptions?.multipleValueButtonText;

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => {
        const raw = current[group.name];
        const entries: Values[] = multiple
          ? (Array.isArray(raw) ? raw : []).map(objectValue)
          : raw
            ? [objectValue(raw)]
            : [];

        const commit = (next: Values[]) => {
          if (multiple) onChange(withKey(current, group.name, next.length ? next : undefined));
          else onChange(withKey(current, group.name, next[0]));
        };

        return (
          <div key={group.name} className="flex flex-col gap-2">
            {groups.length > 1 && (
              <p className="text-xs font-medium text-ui-fg">{group.displayName}</p>
            )}
            {entries.map((entry, index) => (
              <div key={index} className="rounded-lg border border-ui-border-soft bg-ui-surface p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-ui-fg-faint">
                    {group.displayName}
                    {multiple && entries.length > 1 ? ` ${index + 1}` : ""}
                  </span>
                  <button
                    type="button"
                    className={iconButtonClass}
                    aria-label={`Remove ${group.displayName}`}
                    onClick={() => commit(entries.filter((_, position) => position !== index))}
                  >
                    <Icon name="close" className="size-3.5" />
                  </button>
                </div>
                <PropertyList
                  properties={group.values}
                  values={entry}
                  scope={childScope(scope, group.values, entry)}
                  expressions={expressions}
                  onChange={(next) =>
                    commit(entries.map((item, position) => (position === index ? next : item)))
                  }
                />
              </div>
            ))}
            {(multiple || entries.length === 0) && (
              <button
                type="button"
                className={`${smallButtonClass} self-start`}
                onClick={() => commit([...entries, groupDefaults(group.values)])}
              >
                <Icon name="plus" className="size-3.5" />
                {typeof buttonText === "string" && groups.length === 1
                  ? buttonText
                  : `Add ${group.displayName}`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

type Locator = { __rl: true; mode: string; value: unknown; cachedResultName?: string };

function LocatorControl({ property, value, onChange, id, allowExpression }: ControlProps) {
  const modes = locatorModes(property);
  const current: Locator =
    value && typeof value === "object"
      ? { __rl: true, mode: "id", value: "", ...(value as Partial<Locator>) }
      : { __rl: true, mode: modes[0]?.name ?? "id", value: value ?? "" };
  const choices = modes.length ? [...modes] : [{ name: "id", displayName: "ID" }];
  if (!choices.some((mode) => mode.name === current.mode)) {
    choices.unshift({ name: current.mode, displayName: current.mode === "list" ? "ID" : current.mode });
  }
  const active = choices.find((mode) => mode.name === current.mode);

  return (
    <div className="flex gap-2">
      <select
        aria-label={`${property.displayName} mode`}
        className={`${selectClass} w-28 shrink-0`}
        value={current.mode}
        onChange={(event) => onChange({ ...current, mode: event.target.value })}
      >
        {choices.map((mode) => (
          <option key={mode.name} value={mode.name}>
            {mode.displayName}
          </option>
        ))}
      </select>
      <div className="min-w-0 flex-1">
        <TextControl
          id={id}
          value={current.value}
          multi={false}
          placeholder={"placeholder" in (active ?? {}) ? (active as { placeholder?: string }).placeholder : undefined}
          allowExpression={allowExpression}
          onChange={(next) => onChange({ __rl: true, mode: current.mode, value: next })}
        />
      </div>
    </div>
  );
}

function typedValue(type: string, text: string): unknown {
  if (text.includes("{{")) return `=${text}`;
  if (type === "number" && text.trim() !== "" && Number.isFinite(Number(text))) return Number(text);
  if (type === "boolean" && (text === "true" || text === "false")) return text === "true";
  return text;
}

function AssignmentControl({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const rows = readAssignments(value);
  const commit = (next: Assignment[]) => onChange({ assignments: next });

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <div key={row.id || index} className="grid grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1.4fr)_auto] items-center gap-2">
          <input
            aria-label="Field name"
            className={inputClass}
            placeholder="name"
            value={row.name}
            onChange={(event) =>
              commit(rows.map((item, position) => (position === index ? { ...item, name: event.target.value } : item)))
            }
          />
          <select
            aria-label="Field type"
            className={selectClass}
            value={row.type}
            onChange={(event) =>
              commit(rows.map((item, position) => (position === index ? { ...item, type: event.target.value } : item)))
            }
          >
            {assignmentTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <input
            aria-label="Field value"
            className={inputClass}
            placeholder="value or {{ $json.field }}"
            value={toText(row.value)}
            onChange={(event) =>
              commit(
                rows.map((item, position) =>
                  position === index ? { ...item, value: typedValue(item.type, event.target.value) } : item,
                ),
              )
            }
          />
          <button
            type="button"
            className={iconButtonClass}
            aria-label="Remove field"
            onClick={() => commit(rows.filter((_, position) => position !== index))}
          >
            <Icon name="close" className="size-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className={`${smallButtonClass} self-start`}
        onClick={() => commit([...rows, { id: newId(), name: "", value: "", type: "string" }])}
      >
        <Icon name="plus" className="size-3.5" />
        Add field
      </button>
    </div>
  );
}

function FilterControl({ value, version, onChange }: { value: unknown; version: number; onChange: (value: unknown) => void }) {
  const filter = readFilter(value, version);
  const commit = (conditions: FilterCondition[], combinator = filter.combinator) =>
    onChange({ ...filter, conditions, combinator });

  return (
    <div className="flex flex-col gap-2">
      {filter.conditions.length > 1 && (
        <select
          aria-label="Combine conditions"
          className={`${selectClass} w-40`}
          value={filter.combinator}
          onChange={(event) => commit(filter.conditions, event.target.value === "or" ? "or" : "and")}
        >
          <option value="and">All must match</option>
          <option value="or">Any must match</option>
        </select>
      )}
      {filter.conditions.map((condition, index) => {
        const key = operatorKey(condition);
        const operator = filterOperators.find((entry) => entry.key === key)!;
        const update = (change: Partial<FilterCondition>) =>
          commit(filter.conditions.map((item, position) => (position === index ? { ...item, ...change } : item)));

        return (
          <div key={condition.id || index} className="grid grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)_auto] items-center gap-2">
            <input
              aria-label="Value to check"
              className={inputClass}
              placeholder="{{ $json.field }}"
              value={toText(condition.leftValue)}
              onChange={(event) => update({ leftValue: fromText(event.target.value, true) })}
            />
            <select
              aria-label="Operator"
              className={selectClass}
              value={key}
              onChange={(event) => {
                const next = filterOperators.find((entry) => entry.key === event.target.value)!;
                update({
                  operator: {
                    type: next.type,
                    operation: next.operation,
                    ...(next.single ? { singleValue: true } : {}),
                  },
                });
              }}
            >
              {filterOperators.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </select>
            {operator.single ? (
              <span />
            ) : (
              <input
                aria-label="Compare with"
                className={inputClass}
                value={toText(condition.rightValue)}
                onChange={(event) => {
                  const text = event.target.value;
                  update({
                    rightValue:
                      operator.type === "number" && text !== "" && Number.isFinite(Number(text))
                        ? Number(text)
                        : fromText(text, true),
                  });
                }}
              />
            )}
            <button
              type="button"
              className={iconButtonClass}
              aria-label="Remove condition"
              onClick={() => commit(filter.conditions.filter((_, position) => position !== index))}
            >
              <Icon name="close" className="size-3.5" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className={`${smallButtonClass} self-start`}
        onClick={() =>
          commit([
            ...filter.conditions,
            { id: newId(), leftValue: "", rightValue: "", operator: { type: "string", operation: "equals" } },
          ])
        }
      >
        <Icon name="plus" className="size-3.5" />
        Add condition
      </button>
    </div>
  );
}
