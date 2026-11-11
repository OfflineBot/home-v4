import { useId, type CSSProperties } from "react";
import {
  solidEffect,
  swatches,
  type LightChange,
  type LightOption,
  type LightPreset,
} from "../../lib/light";

export type ControlValue = {
  on: boolean;
  brightness: number;
  color: string;
  effect: number;
  palette: number;
  speed: number;
  intensity: number;
};

const selectClass =
  "h-9 w-full min-w-0 cursor-pointer rounded-md border border-ui-border-strong bg-ui-field px-2 text-sm text-ui-fg outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";

const labelClass = "text-xs font-medium tracking-wide text-ui-fg-muted uppercase";

export function PowerSwitch({
  on,
  label,
  disabled,
  onChange,
}: {
  on: boolean;
  label: string;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${
        on ? "border-[var(--accent)] bg-[var(--accent)]" : "border-ui-border-strong bg-ui-field"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-4.5 rounded-full shadow transition-transform duration-200 motion-reduce:transition-none ${
          on ? "translate-x-5 bg-ui-frame" : "translate-x-0 bg-ui-fg-muted"
        }`}
      />
    </button>
  );
}

export function RangeField({
  label,
  value,
  min,
  max,
  disabled,
  format = (current) => String(current),
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        <span className="text-sm text-ui-fg tabular-nums">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ "--fill": `${percent}%` } as CSSProperties}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[linear-gradient(to_right,var(--accent)_var(--fill),var(--ui-field)_var(--fill))] outline-none focus-visible:ring-2 focus-visible:ring-ui-ring disabled:cursor-not-allowed disabled:opacity-50 [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[var(--accent)] [&::-moz-range-thumb]:bg-ui-fg [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--accent)] [&::-webkit-slider-thumb]:bg-ui-fg"
      />
    </div>
  );
}

type Mode = "color" | "animation";

function ModeSwitch({
  mode,
  disabled,
  canAnimate,
  onChange,
}: {
  mode: Mode;
  disabled?: boolean;
  canAnimate: boolean;
  onChange: (mode: Mode) => void;
}) {
  const options: { mode: Mode; label: string }[] = [
    { mode: "color", label: "Color" },
    { mode: "animation", label: "Animation" },
  ];

  return (
    <div className="flex flex-col gap-2">
      <span className={labelClass}>Mode</span>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-ui-border bg-ui-field p-1">
        {options.map((option) => (
          <button
            key={option.mode}
            type="button"
            aria-pressed={mode === option.mode}
            disabled={disabled || (option.mode === "animation" && !canAnimate)}
            onClick={() => onChange(option.mode)}
            className={`h-8 cursor-pointer rounded-md text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${
              mode === option.mode
                ? "bg-ui-raised font-medium text-[var(--accent-fg)] shadow-sm"
                : "text-ui-fg-muted hover:text-ui-fg"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorPicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (color: string) => void;
}) {
  const current = value.toLowerCase();
  const custom = !swatches.some((swatch) => swatch.hex === current);

  return (
    <div className="flex flex-col gap-2">
      <span className={labelClass}>Color</span>
      <div className="flex flex-wrap gap-2">
        {swatches.map((swatch) => (
          <button
            key={swatch.hex}
            type="button"
            title={swatch.name}
            aria-label={swatch.name}
            aria-pressed={current === swatch.hex}
            disabled={disabled}
            onClick={() => onChange(swatch.hex)}
            style={{ backgroundColor: swatch.hex }}
            className={`size-8 cursor-pointer rounded-full border border-black/20 outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ui-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${
              current === swatch.hex
                ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-ui-raised"
                : ""
            }`}
          />
        ))}
        <label
          title="Custom color"
          className={`relative size-8 cursor-pointer overflow-hidden rounded-full border border-black/20 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ui-ring ${
            custom ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-ui-raised" : ""
          }`}
        >
          {custom && (
            <span className="absolute inset-1.5 rounded-full" style={{ backgroundColor: current }} />
          )}
          <input
            type="color"
            aria-label="Custom color"
            value={/^#[0-9a-f]{6}$/.test(current) ? current : "#ffffff"}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}

function OptionSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  options: LightOption[];
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const known = options.some((option) => option.id === value);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select
        id={id}
        value={known ? value : ""}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className={selectClass}
      >
        {!known && <option value="" disabled />}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function sorted(options: LightOption[]) {
  return [...options].sort((a, b) => a.name.localeCompare(b.name));
}

export function defaultEffect(effects: LightOption[]) {
  const animated = effects.filter((option) => option.id !== solidEffect);
  return (animated.find((option) => option.name === "Rainbow") ?? animated[0])?.id;
}

const fallbackColor = swatches[0].hex;

export function LightControls({
  value,
  effects,
  palettes,
  disabled,
  onChange,
}: {
  value: ControlValue;
  effects: LightOption[];
  palettes: LightOption[];
  disabled?: boolean;
  onChange: (change: LightChange) => void;
}) {
  const mode: Mode = value.effect === solidEffect ? "color" : "animation";
  const animated = sorted(effects.filter((option) => option.id !== solidEffect));
  const schemes = sorted(palettes);

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (next === "color") {
      onChange({ color: value.color || fallbackColor });
      return;
    }
    const effect = defaultEffect(effects);
    if (effect !== undefined) onChange({ effect });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-5">
        <RangeField
          label="Brightness"
          value={Math.max(1, value.brightness)}
          min={1}
          max={100}
          disabled={disabled}
          format={(current) => `${current}%`}
          onChange={(brightness) => onChange({ brightness })}
        />
        <ModeSwitch
          mode={mode}
          disabled={disabled}
          canAnimate={animated.length > 0}
          onChange={switchMode}
        />
      </div>

      {mode === "color" ? (
        <ColorPicker
          value={value.color || fallbackColor}
          disabled={disabled}
          onChange={(color) => onChange({ color })}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <OptionSelect
              label="Animation"
              value={value.effect}
              options={animated}
              disabled={disabled}
              onChange={(effect) => onChange({ effect })}
            />
            <OptionSelect
              label="Color scheme"
              value={value.palette}
              options={schemes}
              disabled={disabled || schemes.length === 0}
              onChange={(palette) => onChange({ palette })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <RangeField
              label="Speed"
              value={value.speed}
              min={0}
              max={255}
              disabled={disabled}
              format={(current) => `${Math.round((current / 255) * 100)}%`}
              onChange={(speed) => onChange({ speed })}
            />
            <RangeField
              label="Intensity"
              value={value.intensity}
              min={0}
              max={255}
              disabled={disabled}
              format={(current) => `${Math.round((current / 255) * 100)}%`}
              onChange={(intensity) => onChange({ intensity })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function PresetList({
  presets,
  active,
  disabled,
  onApply,
}: {
  presets: LightPreset[];
  active: number;
  disabled?: boolean;
  onApply: (preset: number) => void;
}) {
  if (presets.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className={labelClass}>Presets</span>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={preset.id === active}
            disabled={disabled}
            onClick={() => onApply(preset.id)}
            className={`flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${
              preset.id === active
                ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_15%,transparent)] text-[var(--accent-fg)]"
                : "border-ui-border bg-ui-field text-ui-fg hover:bg-ui-hover"
            }`}
          >
            {preset.colors.length > 0 && (
              <span className="flex -space-x-1">
                {preset.colors.slice(0, 3).map((color, index) => (
                  <span
                    key={`${color}-${index}`}
                    className="size-3 rounded-full border border-black/20"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </span>
            )}
            {preset.quick_label && <span>{preset.quick_label}</span>}
            <span>{preset.name || `Preset ${preset.id}`}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function LightOrb({ on, brightness, color, animated }: {
  on: boolean;
  brightness: number;
  color: string;
  animated: boolean;
}) {
  if (!on) {
    return <span className="size-9 shrink-0 rounded-full border-2 border-ui-border-strong bg-ui-field" />;
  }

  const level = 0.35 + (Math.max(1, brightness) / 100) * 0.65;
  return (
    <span
      className={`size-9 shrink-0 rounded-full border border-black/10 ${
        animated
          ? "animate-[spin_6s_linear_infinite] bg-[conic-gradient(#ff1a1a,#ffd400,#1aff4a,#00e5ff,#1a4dff,#ff2bd6,#ff1a1a)] motion-reduce:animate-none"
          : ""
      }`}
      style={{
        opacity: level,
        backgroundColor: animated ? undefined : color,
        boxShadow: `0 0 ${Math.round(6 + level * 14)}px ${animated ? "var(--ctp-mauve)" : color}`,
      }}
    />
  );
}
