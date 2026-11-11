import type { Light, LightChange, LightDevice, LightPreset, LightState } from "./light";

export const demoLights: Light[] = [
  { id: -1, name: "Desk", url: "http://192.0.2.21" },
  { id: -2, name: "Ceiling", url: "http://192.0.2.22" },
  { id: -3, name: "Shelf", url: "http://192.0.2.23" },
];

const effects = [
  { id: 0, name: "Solid" },
  { id: 2, name: "Breathe" },
  { id: 9, name: "Rainbow" },
  { id: 38, name: "Aurora" },
  { id: 63, name: "Pride 2015" },
  { id: 66, name: "Fire 2012" },
  { id: 101, name: "Pacifica" },
];

const palettes = [
  { id: 0, name: "Default" },
  { id: 6, name: "Party" },
  { id: 8, name: "Lava" },
  { id: 9, name: "Ocean" },
  { id: 11, name: "Rainbow" },
  { id: 35, name: "Sunset" },
];

const allPresets: LightPreset[] = [
  { id: 1, name: "Morning", quick_label: "AM", playlist: false, on: true, brightness: 70, colors: ["#ffb36b"], effect: 0 },
  { id: 2, name: "Focus", quick_label: "", playlist: false, on: true, brightness: 100, colors: ["#ffffff"], effect: 0 },
  { id: 3, name: "Evening", quick_label: "PM", playlist: false, on: true, brightness: 40, colors: ["#ff7a00", "#8f1aff"], effect: 101 },
  { id: 4, name: "Party", quick_label: "", playlist: false, on: true, brightness: 90, colors: ["#ff2bd6", "#00e5ff", "#ffd400"], effect: 9 },
  { id: 5, name: "Night", quick_label: "", playlist: false, on: true, brightness: 10, colors: ["#ff1a1a"], effect: 0 },
];

const presetIds: Record<number, number[]> = {
  [-1]: [1, 2, 3, 4],
  [-2]: [1, 2, 3],
  [-3]: [1, 3, 4, 5],
};

function presetsFor(id: number) {
  const ids = presetIds[id] ?? [];
  return allPresets.filter((preset) => ids.includes(preset.id));
}

function initial(id: number, on: boolean, brightness: number, color: string, effect = 0): LightState {
  const name = demoLights.find((light) => light.id === id)?.name ?? "Demo";
  return { id, name, on, brightness, preset: -1, playlist: -1, color, colors: [color, "#000000", "#000000"], effect, speed: 128, intensity: 128, palette: 0 };
}

const states = new Map<number, LightState>([
  [-1, initial(-1, true, 80, "#ffb36b")],
  [-2, initial(-2, false, 100, "#ffffff")],
  [-3, initial(-3, true, 45, "#8f1aff", 38)],
]);

const delayMs = 180;

function wait<T>(value: T) {
  return new Promise<T>((resolve) => setTimeout(() => resolve(structuredClone(value)), delayMs));
}

function current(id: number) {
  return states.get(id) ?? initial(id, false, 100, "#ffffff");
}

export function isDemoLight(id: number) {
  return id < 0;
}

export function demoRead(op: string, id: number) {
  const state = current(id);
  if (op === "device") {
    const device: LightDevice = {
      id,
      name: state.name,
      device_name: `WLED-${state.name}`,
      version: "0.15.0",
      leds: 60,
      rgbw: false,
      effects,
      palettes,
    };
    return wait(device);
  }
  if (op === "presets") return wait({ presets: presetsFor(id) });
  return wait(state);
}

export function demoApply(id: number, change: LightChange) {
  const next = { ...current(id) };

  if (change.preset !== undefined) {
    const preset = presetsFor(id).find((entry) => entry.id === change.preset);
    if (preset) {
      next.preset = preset.id;
      next.on = preset.on ?? true;
      if (preset.brightness !== null) next.brightness = preset.brightness;
      if (preset.colors[0]) {
        next.color = preset.colors[0];
        next.colors = [...preset.colors, "#000000", "#000000"].slice(0, 3);
      }
      if (preset.effect !== null) next.effect = preset.effect;
    }
  } else {
    if (Object.keys(change).some((key) => key !== "on" && key !== "brightness")) next.preset = -1;
    if (change.color !== undefined) {
      next.color = change.color;
      next.colors = [change.color, ...next.colors.slice(1)];
      if (change.effect === undefined) next.effect = 0;
    }
    if (change.effect !== undefined) next.effect = change.effect;
    if (change.speed !== undefined) next.speed = change.speed;
    if (change.intensity !== undefined) next.intensity = change.intensity;
    if (change.palette !== undefined) next.palette = change.palette;
  }
  if (change.brightness !== undefined) next.brightness = change.brightness;
  if (change.on !== undefined) next.on = change.on;

  states.set(id, next);
  return wait(next);
}
