import { useId, useState, type ReactNode } from "react";
import { Badge } from "../block";
import { Icon } from "../icons";
import { buttonClass } from "../setting-row";
import {
  LightControls,
  LightOrb,
  PowerSwitch,
  type ControlValue,
  type PresetChoice,
} from "./controls";
import type { LightEntry } from "./use-lights";
import {
  groupChange,
  lightAddress,
  sharedOptions,
  solidEffect,
  type LightChange,
  type LightPreset,
  type LightState,
} from "../../lib/light";

function controlValue(state: LightState): ControlValue {
  return {
    on: state.on,
    brightness: state.brightness,
    color: state.color,
    effect: state.effect,
    palette: state.palette,
    speed: state.speed,
    intensity: state.intensity,
  };
}

function CardFrame({
  orb,
  title,
  detail,
  mono,
  status,
  power,
  children,
}: {
  orb: ReactNode;
  title: string;
  detail?: string;
  mono?: boolean;
  status?: ReactNode;
  power?: ReactNode;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const label = (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-semibold text-ui-fg">{title}</span>
      {detail && (
        <span className={`block truncate text-xs text-ui-fg-muted tabular-nums ${mono ? "font-mono" : ""}`}>
          {detail}
        </span>
      )}
    </span>
  );

  return (
    <section className="overflow-hidden rounded-xl border border-ui-border bg-ui-raised">
      <header className="flex min-h-16 items-center gap-3 px-4 py-3">
        {children ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen(!open)}
            className="-my-1 -ml-1 flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg py-1 pl-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ui-ring"
          >
            {orb}
            {label}
            <span
              className={`grid size-5 shrink-0 place-items-center text-ui-fg-faint transition-transform duration-300 ease-out motion-reduce:transition-none ${
                open ? "rotate-90" : ""
              }`}
            >
              <Icon name="chevron" />
            </span>
          </button>
        ) : (
          <>
            {orb}
            {label}
          </>
        )}
        {status}
        {power}
      </header>
      {children && (
        <div
          id={bodyId}
          inert={!open}
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex flex-col gap-5 border-t border-ui-border-soft p-4">{children}</div>
          </div>
        </div>
      )}
    </section>
  );
}

function presetName(preset: LightPreset) {
  return preset.name.trim() || `Preset ${preset.id}`;
}

function presetKey(preset: LightPreset) {
  return presetName(preset).toLocaleLowerCase();
}

function presetChoices(presets: LightPreset[]): PresetChoice[] {
  return [...presets]
    .map((preset) => ({ id: preset.id, name: presetName(preset) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

type Collected = PresetChoice & { key: string; count: number };

function collectPresets(entries: (LightEntry & { state: LightState })[]) {
  const byKey = new Map<string, Collected>();
  for (const entry of entries) {
    for (const preset of entry.presets) {
      const key = presetKey(preset);
      const known = byKey.get(key);
      if (known) known.count += 1;
      else byKey.set(key, { id: 0, key, name: presetName(preset), count: 1 });
    }
  }

  return [...byKey.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((preset, index) => ({
      ...preset,
      id: index + 1,
      name: preset.count === entries.length ? preset.name : `${preset.name} · ${preset.count} of ${entries.length}`,
    }));
}

function activeGroupPreset(entries: (LightEntry & { state: LightState })[], collected: Collected[]) {
  const keys = entries.map((entry) => {
    const preset = entry.presets.find((item) => item.id === entry.state.preset);
    return preset ? presetKey(preset) : null;
  });
  const first = keys[0];
  if (!first || keys.some((key) => key !== first)) return -1;
  return collected.find((preset) => preset.key === first)?.id ?? -1;
}

function stateSummary(state: LightState, effects: { id: number; name: string }[], presets: LightPreset[]) {
  if (!state.on) return "Off";
  const preset = presets.find((item) => item.id === state.preset);
  if (preset) return `On · ${state.brightness} % · ${presetName(preset)}`;
  const effect = state.effect !== solidEffect ? effects.find((option) => option.id === state.effect)?.name : null;
  return effect ? `On · ${state.brightness} % · ${effect}` : `On · ${state.brightness} %`;
}

export function LightCard({
  entry,
  onApply,
  onRetry,
}: {
  entry: LightEntry;
  onApply: (change: LightChange) => void;
  onRetry: () => void;
}) {
  const { light, state, device } = entry;

  if (entry.status === "loading" && !state) {
    return (
      <CardFrame
        orb={<span className="size-9 shrink-0 animate-pulse rounded-full bg-ui-field" />}
        title={light.name}
        detail="Connecting…"
      />
    );
  }

  if (entry.status === "error" || !state) {
    return (
      <CardFrame
        orb={
          <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-dashed border-ui-border-strong text-ui-fg-faint">
            <Icon name="lights" className="size-4" />
          </span>
        }
        title={light.name}
        detail={lightAddress(light.url)}
        mono
        status={<Badge tone="bad">{entry.error ?? "Not reachable"}</Badge>}
        power={
          <button type="button" onClick={onRetry} className={buttonClass}>
            Retry
          </button>
        }
      />
    );
  }

  return (
    <CardFrame
      orb={
        <LightOrb
          on={state.on}
          brightness={state.brightness}
          color={state.color}
          animated={state.effect !== solidEffect}
        />
      }
      title={light.name}
      detail={stateSummary(state, device?.effects ?? [], entry.presets)}
      power={
        <PowerSwitch
          on={state.on}
          label={`${light.name} on`}
          onChange={(on) => onApply({ on })}
        />
      }
    >
      <LightControls
        value={controlValue(state)}
        effects={device?.effects ?? []}
        palettes={device?.palettes ?? []}
        presets={presetChoices(entry.presets)}
        preset={state.preset}
        onChange={(change) => onApply(state.on || change.on !== undefined ? change : { ...change, on: true })}
        onPreset={(preset) => onApply({ preset })}
      />
    </CardFrame>
  );
}

export function AllLightsCard({
  entries,
  onApply,
}: {
  entries: LightEntry[];
  onApply: (id: number, change: LightChange) => void;
}) {
  const ready = entries.filter(
    (entry): entry is LightEntry & { state: LightState } =>
      entry.status === "ready" && entry.state !== null,
  );
  const lead = ready[0];
  const withDevice = ready.every((entry) => entry.device !== null);
  const effects = withDevice ? sharedOptions(ready.map((entry) => entry.device!.effects)) : [];
  const palettes = withDevice ? sharedOptions(ready.map((entry) => entry.device!.palettes)) : [];
  const onCount = ready.filter((entry) => entry.state.on).length;
  const anyOn = onCount > 0;
  const collected = collectPresets(ready);

  function applyPreset(id: number) {
    const chosen = collected.find((preset) => preset.id === id);
    if (!chosen) return;
    for (const entry of ready) {
      const match = entry.presets.find((preset) => presetKey(preset) === chosen.key);
      if (match) onApply(entry.light.id, { preset: match.id });
    }
  }

  function applyAll(change: LightChange) {
    for (const entry of ready) {
      const mapped = groupChange(change, { effects, palettes }, entry.device, entry.state.on);
      if (mapped) onApply(entry.light.id, mapped);
    }
  }

  return (
    <CardFrame
      orb={
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] text-[var(--accent)]">
          <Icon name="lights" className="size-5" />
        </span>
      }
      title="All lights"
      detail={`${onCount} of ${entries.length} on`}
      power={
        <PowerSwitch
          on={anyOn}
          label="All lights on"
          disabled={ready.length === 0}
          onChange={(on) => {
            for (const entry of ready) {
              if (entry.state.on !== on) onApply(entry.light.id, { on });
            }
          }}
        />
      }
    >
      {lead ? (
        <LightControls
          value={controlValue(lead.state)}
          effects={effects}
          palettes={palettes}
          presets={collected}
          preset={activeGroupPreset(ready, collected)}
          onChange={applyAll}
          onPreset={applyPreset}
        />
      ) : (
        <p className="text-sm text-ui-fg-muted">No light is reachable.</p>
      )}
    </CardFrame>
  );
}
