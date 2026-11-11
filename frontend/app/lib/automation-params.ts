import type {
  CollectionGroup,
  NodeDescription,
  NodeProperty,
  PropertyOption,
} from "./automation";

export type Values = Record<string, unknown>;

export type Scope = {
  values: Values;
  properties: NodeProperty[];
  root: Values;
  rootProperties: NodeProperty[];
  version: number;
};

const maxDepth = 6;
const customCall = "__CUSTOM_API_CALL__";

export const unsupportedTypes = new Set([
  "resourceMapper",
  "credentialsSelect",
  "credentials",
  "workflowSelector",
  "agentSelector",
  "icon",
]);

export const skippedTypes = new Set(["hidden", "curlImport", "button"]);

export function rootScope(
  properties: NodeProperty[],
  values: Values,
  version: number,
): Scope {
  return { values, properties, root: values, rootProperties: properties, version };
}

export function childScope(scope: Scope, properties: NodeProperty[], values: Values): Scope {
  return { ...scope, values, properties };
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}

function condition(actual: unknown, rule: Record<string, unknown>) {
  const [op, expected] = Object.entries(rule)[0] ?? [];

  switch (op) {
    case "eq":
      return same(actual, expected);
    case "not":
      return !same(actual, expected);
    case "gte":
      return asNumber(actual) >= asNumber(expected);
    case "lte":
      return asNumber(actual) <= asNumber(expected);
    case "gt":
      return asNumber(actual) > asNumber(expected);
    case "lt":
      return asNumber(actual) < asNumber(expected);
    case "between": {
      const range = expected as { from?: number; to?: number };
      const value = asNumber(actual);
      return value >= asNumber(range?.from) && value <= asNumber(range?.to);
    }
    case "startsWith":
      return typeof actual === "string" && actual.startsWith(String(expected));
    case "endsWith":
      return typeof actual === "string" && actual.endsWith(String(expected));
    case "includes":
      return typeof actual === "string" && actual.includes(String(expected));
    case "regex":
      try {
        return typeof actual === "string" && new RegExp(String(expected)).test(actual);
      } catch {
        return false;
      }
    case "exists":
      return actual !== undefined && actual !== null && actual !== "";
  }

  return false;
}

function matches(actual: unknown, expected: unknown) {
  if (expected && typeof expected === "object" && "_cnd" in expected) {
    return condition(actual, (expected as { _cnd: Record<string, unknown> })._cnd);
  }

  return same(actual, expected);
}

function lookup(key: string, scope: Scope, depth: number): unknown {
  if (key === "@version") return scope.version;
  if (key.startsWith("@")) return undefined;

  if (key.startsWith("/")) {
    const name = key.slice(1);
    const top = rootScope(scope.rootProperties, scope.root, scope.version);
    return name in scope.root ? scope.root[name] : defaultOf(name, top, depth + 1);
  }

  return key in scope.values ? scope.values[key] : defaultOf(key, scope, depth + 1);
}

function defaultOf(name: string, scope: Scope, depth: number): unknown {
  const candidates = scope.properties.filter((property) => property.name === name);
  if (candidates.length === 0) return undefined;
  if (depth > maxDepth) return candidates[0].default;

  const visible = candidates.find((property) => isVisible(property, scope, depth));
  return (visible ?? candidates[0]).default;
}

export function isVisible(property: NodeProperty, scope: Scope, depth = 0) {
  const options = property.displayOptions;
  if (!options || depth > maxDepth) return true;

  for (const [key, expected] of Object.entries(options.show ?? {})) {
    const actual = lookup(key, scope, depth);
    const list = Array.isArray(actual) && key !== "@version" ? actual : [actual];
    const wanted = Array.isArray(expected) ? expected : [expected];
    if (!wanted.some((value) => list.some((item) => matches(item, value)))) {
      return false;
    }
  }

  for (const [key, expected] of Object.entries(options.hide ?? {})) {
    const actual = lookup(key, scope, depth);
    const list = Array.isArray(actual) && key !== "@version" ? actual : [actual];
    const wanted = Array.isArray(expected) ? expected : [expected];
    if (wanted.some((value) => list.some((item) => matches(item, value)))) {
      return false;
    }
  }

  return true;
}

export function visibleProperties(properties: NodeProperty[], scope: Scope) {
  const seen = new Set<string>();

  return properties.filter((property) => {
    if (seen.has(property.name) || !isVisible(property, scope)) return false;
    seen.add(property.name);
    return true;
  });
}

export function valueOf(property: NodeProperty, values: Values) {
  return property.name in values ? values[property.name] : property.default;
}

export function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

export function initialValue(property: NodeProperty): unknown {
  if (property.type === "resourceLocator") {
    const base = (property.default ?? {}) as { mode?: string; value?: unknown };
    return {
      __rl: true,
      mode: locatorModes(property)[0]?.name ?? base.mode ?? "id",
      value: base.value ?? "",
    };
  }
  if (property.type === "fixedCollection" || property.type === "collection") {
    return clone(property.default ?? {});
  }
  if (property.type === "assignmentCollection") return { assignments: [] };
  if (property.type === "filter") return emptyFilter();

  return clone(property.default);
}

export function pruneParameters(
  properties: NodeProperty[],
  values: Values,
  version: number,
) {
  const scope = rootScope(properties, values, version);
  const names = new Set(properties.map((property) => property.name));
  const visible = new Set(visibleProperties(properties, scope).map((property) => property.name));
  const kept: Values = {};

  for (const [key, value] of Object.entries(values)) {
    if (!names.has(key) || visible.has(key)) kept[key] = value;
  }

  return kept;
}

export function normalizeParameters(
  properties: NodeProperty[],
  values: Values,
  version: number,
) {
  let current = values;

  for (let pass = 0; pass < maxDepth; pass++) {
    const next = pruneParameters(properties, current, version);
    const scope = rootScope(properties, next, version);

    for (const property of visibleProperties(properties, scope)) {
      if (property.type !== "options" || isDynamic(property)) continue;

      const value = next[property.name];
      if (value === undefined) {
        if (property.default !== undefined) next[property.name] = clone(property.default);
        continue;
      }
      if (isExpression(value)) continue;

      const valid = ((property.options ?? []) as PropertyOption[]).some(
        (option) => option && "value" in option && same(option.value, value),
      );
      if (!valid) next[property.name] = clone(property.default);
    }

    if (same(next, current)) return next;
    current = next;
  }

  return current;
}

export function isExpression(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("=");
}

export function fromText(text: string, allowExpression: boolean) {
  return allowExpression && text.includes("{{") ? `=${text}` : text;
}

export function toText(value: unknown) {
  if (value === undefined || value === null) return "";
  if (isExpression(value)) return value.slice(1);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function isDynamic(property: NodeProperty) {
  const options = property.typeOptions ?? {};
  return Boolean(options.loadOptionsMethod || options.loadOptions);
}

export function choiceOptions(property: NodeProperty) {
  const seen = new Set<string>();

  return ((property.options ?? []) as PropertyOption[]).filter((option) => {
    if (!option || !("value" in option) || option.value === customCall) return false;
    const key = JSON.stringify(option.value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function collectionOptions(property: NodeProperty) {
  return ((property.options ?? []) as NodeProperty[]).filter(
    (option) => option && "type" in option,
  );
}

export function collectionGroups(property: NodeProperty) {
  return ((property.options ?? []) as CollectionGroup[]).filter(
    (group) => group && Array.isArray(group.values),
  );
}

export function locatorModes(property: NodeProperty) {
  return (property.modes ?? []).filter((mode) => mode.type !== "list" && mode.name !== "list");
}

export function multiline(property: NodeProperty) {
  const rows = Number(property.typeOptions?.rows ?? 0);
  return rows > 1 || Boolean(property.typeOptions?.editor);
}

export function isPassword(property: NodeProperty) {
  return Boolean(property.typeOptions?.password);
}

export function numberLimits(property: NodeProperty) {
  const options = property.typeOptions ?? {};
  const precision = Number(options.numberPrecision ?? 0);

  return {
    min: typeof options.minValue === "number" ? options.minValue : undefined,
    max: typeof options.maxValue === "number" ? options.maxValue : undefined,
    step: precision > 0 ? 1 / 10 ** precision : 1,
  };
}

export function nodeCredentials(description: NodeDescription, values: Values, version: number) {
  const scope = rootScope(description.properties, values, version);

  return (description.credentials ?? []).filter((credential) =>
    isVisible(
      {
        name: credential.name,
        displayName: credential.name,
        type: "credentials",
        displayOptions: credential.displayOptions,
      },
      scope,
    ),
  );
}

export function nodeDefaults(description: NodeDescription, version: number) {
  const values = normalizeParameters(description.properties, {}, version);
  const scope = rootScope(description.properties, values, version);

  for (const property of visibleProperties(description.properties, scope)) {
    if (property.type === "resourceLocator" && !(property.name in values)) {
      values[property.name] = initialValue(property);
    }
  }

  return values;
}

export function credentialDefaults(properties: NodeProperty[]) {
  const values: Values = {};

  for (const property of properties) {
    if (property.type === "notice" || property.default === undefined) continue;
    if (!(property.name in values)) values[property.name] = clone(property.default);
  }

  return values;
}

export function credentialData(properties: NodeProperty[], values: Values) {
  const scope = rootScope(properties, values, 1);
  const data: Values = {};

  for (const property of visibleProperties(properties, scope)) {
    if (property.type === "notice") continue;
    const value = valueOf(property, values);
    if (value === undefined) continue;
    data[property.name] = value;
  }

  return data;
}

export function missingRequired(properties: NodeProperty[], values: Values) {
  const scope = rootScope(properties, values, 1);

  return visibleProperties(properties, scope)
    .filter((property) => property.required && property.type !== "notice")
    .filter((property) => {
      const value = valueOf(property, values);
      return value === undefined || value === null || value === "";
    })
    .map((property) => property.displayName);
}

export function noticeText(html: string) {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export type FilterOperator = {
  key: string;
  label: string;
  type: string;
  operation: string;
  single?: boolean;
};

export const filterOperators: FilterOperator[] = [
  { key: "string:equals", label: "is equal to", type: "string", operation: "equals" },
  { key: "string:notEquals", label: "is not equal to", type: "string", operation: "notEquals" },
  { key: "string:contains", label: "contains", type: "string", operation: "contains" },
  { key: "string:notContains", label: "does not contain", type: "string", operation: "notContains" },
  { key: "string:startsWith", label: "starts with", type: "string", operation: "startsWith" },
  { key: "string:endsWith", label: "ends with", type: "string", operation: "endsWith" },
  { key: "string:empty", label: "is empty", type: "string", operation: "empty", single: true },
  { key: "string:notEmpty", label: "is not empty", type: "string", operation: "notEmpty", single: true },
  { key: "number:equals", label: "number =", type: "number", operation: "equals" },
  { key: "number:gt", label: "number >", type: "number", operation: "gt" },
  { key: "number:gte", label: "number ≥", type: "number", operation: "gte" },
  { key: "number:lt", label: "number <", type: "number", operation: "lt" },
  { key: "number:lte", label: "number ≤", type: "number", operation: "lte" },
  { key: "boolean:true", label: "is true", type: "boolean", operation: "true", single: true },
  { key: "boolean:false", label: "is false", type: "boolean", operation: "false", single: true },
];

export type FilterCondition = {
  id: string;
  leftValue: unknown;
  rightValue: unknown;
  operator: { type: string; operation: string; singleValue?: boolean };
};

export type FilterValue = {
  conditions: FilterCondition[];
  combinator: "and" | "or";
  options: Record<string, unknown>;
};

export function emptyFilter(version = 2): FilterValue {
  return {
    conditions: [],
    combinator: "and",
    options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version },
  };
}

export function filterVersion(nodeVersion: number) {
  if (nodeVersion >= 2.4) return 4;
  if (nodeVersion >= 2.3) return 3;
  if (nodeVersion >= 2.2) return 2;
  return 1;
}

export function readFilter(value: unknown, nodeVersion: number): FilterValue {
  const base = emptyFilter(filterVersion(nodeVersion));
  if (!value || typeof value !== "object") return base;

  const raw = value as Partial<FilterValue>;
  return {
    conditions: Array.isArray(raw.conditions) ? raw.conditions : [],
    combinator: raw.combinator === "or" ? "or" : "and",
    options: { ...base.options, ...(raw.options ?? {}) },
  };
}

export function operatorKey(condition: FilterCondition) {
  const key = `${condition.operator?.type}:${condition.operator?.operation}`;
  return filterOperators.some((operator) => operator.key === key) ? key : "string:equals";
}

export type Assignment = {
  id: string;
  name: string;
  value: unknown;
  type: string;
};

export const assignmentTypes = ["string", "number", "boolean", "array", "object"];

export function readAssignments(value: unknown): Assignment[] {
  const raw = (value as { assignments?: Assignment[] } | null)?.assignments;
  return Array.isArray(raw) ? raw : [];
}
