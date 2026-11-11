import type { ReactNode } from "react";
import { Badge } from "../block";
import { Icon } from "../icons";
import { buttonClass } from "../setting-row";
import {
  LightControls,
  LightOrb,
  PowerSwitch,
  PresetList,
  type ControlValue,
} from "./controls";
import type { LightEntry } from "./use-lights";
import {
  groupChange,
  lightAddress,
  sharedOptions,
  solidEffect,
  type LightChange,
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
  status,
  power,
  children,
}: {
  orb: ReactNode;
  title: string;
  detail?: string;
  status?: ReactNode;
  power?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-ui-border bg-ui-raised">
      <header className="flex min-h-16 items-center gap-3 px-4 py-3">
        {orb}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-ui-fg">{title}</h2>
          {detail && <p className="truncate font-mono text-xs text-ui-fg-muted">{detail}</p>}
        </div>
        {status}
        {power}
      </header>
      {children && <div className="flex flex-col gap-5 border-t border-ui-border-soft p-4">{children}</div>}
    </section>
  );
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
        detail={lightAddress(light.url)}
        status={<Badge>Connecting…</Badge>}
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
      detail={device?.device_name && device.device_name !== light.name
        ? `${device.device_name} · ${lightAddress(light.url)}`
        : lightAddress(light.url)}
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
        onChange={(change) => onApply(state.on || change.on !== undefined ? change : { ...change, on: true })}
      />
      <PresetList
        presets={entry.presets}
        active={state.preset}
        onApply={(preset) => onApply({ preset })}
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
    >
      {lead ? (
        <LightControls
          value={controlValue(lead.state)}
          effects={effects}
          palettes={palettes}
          onChange={applyAll}
        />
      ) : (
        <p className="text-sm text-ui-fg-muted">No light is reachable.</p>
      )}
    </CardFrame>
  );
}
