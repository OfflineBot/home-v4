import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Badge } from "../block";
import { Icon } from "../icons";
import { Toast } from "../toast";
import { lightsApi, type Light, type LightState } from "../../lib/light";

type LightsBlockProps = {
  lights: Light[];
};

type Entry = LightState | "loading" | "error";

const refreshMs = 60_000;
const demoDelayMs = 250;

const demoLights: Light[] = [
  { id: -1, name: "Desk", url: "" },
  { id: -2, name: "Ceiling", url: "" },
  { id: -3, name: "Shelf", url: "" },
];

function demoState(id: number, name: string, on: boolean, brightness: number, color: string): LightState {
  return { id, name, on, brightness, preset: -1, playlist: -1, color, colors: [color], effect: 0, speed: 128, intensity: 128, palette: 0 };
}

const demoStates: Record<number, Entry> = {
  [-1]: demoState(-1, "Desk", true, 80, "#ffb36b"),
  [-2]: demoState(-2, "Ceiling", false, 100, "#ffffff"),
  [-3]: demoState(-3, "Shelf", true, 45, "#8f1aff"),
};

export function LightsBlock({ lights }: LightsBlockProps) {
  const demo = lights.length === 0;
  const shown = demo ? demoLights : lights;
  const [states, setStates] = useState<Record<number, Entry>>(demo ? demoStates : {});
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [failure, setFailure] = useState({ message: "", attempt: 0 });
  const ids = lights.map((light) => light.id).join(",");

  const fail = (message: string) =>
    setFailure((current) => ({ message, attempt: current.attempt + 1 }));

  const load = useCallback(
    (initial: boolean) => {
      for (const light of lights) {
        if (initial) setStates((current) => ({ ...current, [light.id]: current[light.id] ?? "loading" }));
        lightsApi.state(light.id).then(
          (state) => setStates((current) => ({ ...current, [light.id]: state })),
          () => setStates((current) => ({ ...current, [light.id]: "error" })),
        );
      }
    },
    [ids],
  );

  useEffect(() => {
    if (demo) {
      setStates((current) => ({ ...demoStates, ...current }));
      return;
    }
    load(true);
    const refresh = () => {
      if (document.visibilityState === "visible") load(false);
    };
    const id = setInterval(refresh, refreshMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, demo]);

  async function switchLight(light: Light, on: boolean) {
    const before = states[light.id];
    if (typeof before === "object") {
      setStates((current) => ({ ...current, [light.id]: { ...before, on } }));
    }
    setBusy((current) => ({ ...current, [light.id]: true }));

    try {
      if (demo) {
        await new Promise((resolve) => setTimeout(resolve, demoDelayMs));
        return;
      }
      const state = await lightsApi.apply(light.id, { on });
      setStates((current) => ({ ...current, [light.id]: state }));
    } catch (error) {
      setStates((current) => ({ ...current, [light.id]: before ?? "error" }));
      fail(`${light.name}: ${error instanceof Error ? error.message : "Failed"}`);
    } finally {
      setBusy((current) => ({ ...current, [light.id]: false }));
    }
  }

  const known = shown.filter((light) => typeof states[light.id] === "object");
  const anyOn = known.some((light) => (states[light.id] as LightState).on);

  function switchAll(on: boolean) {
    for (const light of known) {
      if ((states[light.id] as LightState).on !== on) switchLight(light, on);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-ui-border bg-ui-raised">
      <header className="flex h-10 items-center gap-2.5 border-b border-ui-border-soft bg-ui-surface px-4">
        <h2 className="text-sm font-semibold text-ui-fg">Lights</h2>
        {demo && <Badge>Demo</Badge>}
        {known.length > 1 && (
          <button
            type="button"
            onClick={() => switchAll(!anyOn)}
            className="ml-auto rounded-md px-1.5 text-xs text-ui-fg-muted outline-none hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
          >
            {anyOn ? "All off" : "All on"}
          </button>
        )}
      </header>

      <div className="flex flex-col gap-3 p-4">
        <ul className="flex flex-col gap-2">
          {shown.map((light) => (
            <LightRow
              key={light.id}
              light={light}
              entry={states[light.id] ?? "loading"}
              busy={busy[light.id] === true}
              onSwitch={(on) => switchLight(light, on)}
            />
          ))}
        </ul>
        {demo && (
          <Link to="/lights" className="self-start px-1 text-xs text-ctp-pink hover:underline">
            Add a light
          </Link>
        )}
      </div>

      <Toast key={failure.attempt} message={failure.attempt > 0 ? failure.message : null} />
    </section>
  );
}

type LightRowProps = {
  light: Light;
  entry: Entry;
  busy: boolean;
  onSwitch: (on: boolean) => void;
};

function LightRow({ light, entry, busy, onSwitch }: LightRowProps) {
  const state = typeof entry === "object" ? entry : null;
  const on = state?.on === true;
  const color = state && /^#[0-9a-f]{6}$/i.test(state.color) ? state.color : null;

  return (
    <li
      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors motion-reduce:transition-none ${
        on
          ? "border-[color-mix(in_oklab,var(--ctp-pink)_45%,transparent)] bg-[color-mix(in_oklab,var(--ctp-pink)_7%,var(--ui-surface))]"
          : "border-ui-border-soft bg-ui-surface"
      }`}
    >
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-lg transition-colors motion-reduce:transition-none ${
          on ? "text-ui-frame" : "bg-ui-field text-ui-fg-faint"
        }`}
        style={on ? { background: color ?? "var(--ctp-pink)" } : undefined}
      >
        <Icon name="lights" className="size-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ui-fg">{light.name}</span>
        <span className={`block text-xs tabular-nums ${entry === "error" ? "text-ui-danger" : "text-ui-fg-muted"}`}>
          {entry === "loading"
            ? "Checking…"
            : entry === "error"
              ? "Not reachable"
              : on
                ? `On · ${entry.brightness} %`
                : "Off"}
        </span>
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={light.name}
        disabled={state === null || busy}
        onClick={() => onSwitch(!on)}
        className={`relative h-7 w-12 shrink-0 cursor-pointer rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${
          on ? "border-ctp-pink bg-ctp-pink" : "border-ui-border-strong bg-ui-field"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-5 rounded-full shadow-sm transition-transform motion-reduce:transition-none ${
            on ? "translate-x-5 bg-ui-frame" : "bg-ui-fg-muted"
          }`}
        />
      </button>
    </li>
  );
}
