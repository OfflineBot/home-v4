import { demoApply, demoRead, isDemoLight } from "./light-demo";

export type Light = {
  id: number;
  name: string;
  url: string;
};

export type LightState = {
  id: number;
  name: string;
  on: boolean;
  brightness: number;
  preset: number;
  playlist: number;
  color: string;
  colors: string[];
  effect: number;
  speed: number;
  intensity: number;
  palette: number;
};

export type LightOption = { id: number; name: string };

export type LightDevice = {
  id: number;
  name: string;
  device_name: string;
  version: string;
  leds: number;
  rgbw: boolean;
  effects: LightOption[];
  palettes: LightOption[];
};

export type LightPreset = {
  id: number;
  name: string;
  quick_label: string;
  playlist: boolean;
  on: boolean | null;
  brightness: number | null;
  colors: string[];
  effect: number | null;
};

export type LightChange = {
  on?: boolean;
  brightness?: number;
  preset?: number;
  color?: string;
  effect?: number;
  speed?: number;
  intensity?: number;
  palette?: number;
};

export const changeKeys = [
  "on",
  "brightness",
  "preset",
  "color",
  "effect",
  "speed",
  "intensity",
  "palette",
] as const;

export const solidEffect = 0;

export const swatches: { name: string; hex: string }[] = [
  { name: "Warm white", hex: "#ffb36b" },
  { name: "White", hex: "#ffffff" },
  { name: "Red", hex: "#ff1a1a" },
  { name: "Orange", hex: "#ff7a00" },
  { name: "Yellow", hex: "#ffd400" },
  { name: "Green", hex: "#1aff4a" },
  { name: "Cyan", hex: "#00e5ff" },
  { name: "Blue", hex: "#1a4dff" },
  { name: "Purple", hex: "#8f1aff" },
  { name: "Pink", hex: "#ff2bd6" },
];

const errorMessages: Record<string, string> = {
  invalid_light: "Check the name.",
  invalid_url: "Check the address.",
  invalid_body: "Check the light details.",
  invalid_id: "Unknown light.",
  invalid_change: "This change is not possible.",
  duplicate: "This name or address is already used.",
  not_wled: "No WLED device answers at this address.",
  unreachable: "The light is not reachable.",
  not_found: "This light no longer exists.",
  preset_not_found: "This preset no longer exists.",
  unreachable_backend: "Backend not reachable",
};

export function lightError(code: string | undefined, status: number) {
  return (code && errorMessages[code]) || `Failed (${status})`;
}

export function lightAddress(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function isColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function mergeChange(pending: LightChange | null, change: LightChange): LightChange {
  const next: LightChange = { ...pending };

  if (change.preset !== undefined) {
    delete next.color;
    delete next.effect;
    delete next.speed;
    delete next.intensity;
    delete next.palette;
  } else if (
    change.color !== undefined ||
    change.effect !== undefined ||
    change.speed !== undefined ||
    change.intensity !== undefined ||
    change.palette !== undefined
  ) {
    delete next.preset;
  }
  if (change.color !== undefined && change.effect === undefined) delete next.effect;

  return { ...next, ...change };
}

export function applyChange(state: LightState, change: LightChange): LightState {
  const next = { ...state };

  if (change.on !== undefined) next.on = change.on;
  if (change.brightness !== undefined) next.brightness = change.brightness;
  if (change.color !== undefined) {
    next.color = change.color;
    next.colors = [change.color, ...state.colors.slice(1)];
    if (change.effect === undefined) next.effect = solidEffect;
  }
  if (change.effect !== undefined) next.effect = change.effect;
  if (change.speed !== undefined) next.speed = change.speed;
  if (change.intensity !== undefined) next.intensity = change.intensity;
  if (change.palette !== undefined) next.palette = change.palette;
  if (change.preset !== undefined) next.preset = change.preset;
  else if (Object.keys(change).some((key) => key !== "on" && key !== "brightness")) next.preset = -1;

  return next;
}

export function sharedOptions(lists: LightOption[][]) {
  if (lists.length === 0) return [];
  const [first, ...rest] = lists;
  return first.filter((option) =>
    rest.every((list) => list.some((entry) => entry.name === option.name)),
  );
}

export function optionId(list: LightOption[], name: string | undefined) {
  if (name === undefined) return undefined;
  return list.find((option) => option.name === name)?.id;
}

export function groupChange(
  change: LightChange,
  shared: { effects: LightOption[]; palettes: LightOption[] },
  device: { effects: LightOption[]; palettes: LightOption[] } | null,
  on: boolean,
) {
  const mapped: LightChange = { ...change };

  if (change.effect !== undefined) {
    const name = shared.effects.find((option) => option.id === change.effect)?.name;
    const id =
      change.effect === solidEffect ? solidEffect : optionId(device?.effects ?? [], name);
    if (id === undefined) delete mapped.effect;
    else mapped.effect = id;
  }
  if (change.palette !== undefined) {
    const name = shared.palettes.find((option) => option.id === change.palette)?.name;
    const id = optionId(device?.palettes ?? [], name);
    if (id === undefined) delete mapped.palette;
    else mapped.palette = id;
  }
  if (!on && change.on === undefined) mapped.on = true;

  return Object.keys(mapped).length > 0 ? mapped : null;
}

export class LightRequestError extends Error {
  constructor(code: string | undefined, status: number) {
    super(lightError(code, status));
  }
}

const endpoint = "/lights/api";

async function read<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new LightRequestError(data?.error, res.status);
  return data as T;
}

async function get<T>(op: string, id: number) {
  if (isDemoLight(id)) return (await demoRead(op, id)) as T;
  let res: Response;
  try {
    res = await fetch(`${endpoint}?${new URLSearchParams({ op, id: String(id) })}`);
  } catch {
    throw new LightRequestError("unreachable_backend", 0);
  }
  return read<T>(res);
}

export const lightsApi = {
  state: (id: number) => get<LightState>("state", id),
  device: (id: number) => get<LightDevice>("device", id),
  presets: (id: number) =>
    get<{ presets?: LightPreset[] | null }>("presets", id).then((data) => data.presets ?? []),
  async apply(id: number, change: LightChange) {
    if (isDemoLight(id)) return demoApply(id, change);
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, change }),
      });
    } catch {
      throw new LightRequestError("unreachable_backend", 0);
    }
    return read<LightState>(res);
  },
};
