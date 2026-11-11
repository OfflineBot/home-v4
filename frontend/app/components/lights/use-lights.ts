import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyChange,
  lightsApi,
  mergeChange,
  type Light,
  type LightChange,
  type LightDevice,
  type LightPreset,
  type LightState,
} from "../../lib/light";

export type LightEntry = {
  light: Light;
  status: "loading" | "ready" | "error";
  state: LightState | null;
  device: LightDevice | null;
  presets: LightPreset[];
  error: string | null;
};

type Queue = {
  pending: LightChange | null;
  inflight: boolean;
  touched: number;
};

const refreshMs = 30_000;
const quietMs = 2_000;

function message(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function useLights(lights: Light[], onError: (message: string) => void) {
  const [entries, setEntries] = useState<Record<number, LightEntry>>(() =>
    Object.fromEntries(
      lights.map((light) => [
        light.id,
        { light, status: "loading", state: null, device: null, presets: [], error: null },
      ]),
    ),
  );
  const queues = useRef(new Map<number, Queue>());
  const errorRef = useRef(onError);

  useEffect(() => {
    errorRef.current = onError;
  });

  const patch = useCallback((id: number, update: (entry: LightEntry) => LightEntry) => {
    setEntries((current) => (current[id] ? { ...current, [id]: update(current[id]) } : current));
  }, []);

  const queue = useCallback((id: number) => {
    let entry = queues.current.get(id);
    if (!entry) {
      entry = { pending: null, inflight: false, touched: 0 };
      queues.current.set(id, entry);
    }
    return entry;
  }, []);

  const load = useCallback(
    async (light: Light) => {
      patch(light.id, (entry) => ({ ...entry, status: entry.state ? entry.status : "loading" }));
      const [state, device, presets] = await Promise.allSettled([
        lightsApi.state(light.id),
        lightsApi.device(light.id),
        lightsApi.presets(light.id),
      ]);

      patch(light.id, (entry) =>
        state.status === "fulfilled"
          ? {
              ...entry,
              status: "ready",
              state: state.value,
              device: device.status === "fulfilled" ? device.value : entry.device,
              presets: presets.status === "fulfilled" ? presets.value : entry.presets,
              error: null,
            }
          : { ...entry, status: "error", error: message(state.reason) },
      );
    },
    [patch],
  );

  const refresh = useCallback(async () => {
    await Promise.all(
      lights.map(async (light) => {
        const current = queue(light.id);
        if (current.inflight || current.pending || Date.now() - current.touched < quietMs) return;
        try {
          const state = await lightsApi.state(light.id);
          const after = queue(light.id);
          if (after.inflight || after.pending || Date.now() - after.touched < quietMs) return;
          patch(light.id, (entry) => ({ ...entry, status: "ready", state, error: null }));
        } catch (error) {
          patch(light.id, (entry) =>
            entry.status === "ready" ? { ...entry, status: "error", error: message(error) } : entry,
          );
        }
      }),
    );
  }, [lights, patch, queue]);

  useEffect(() => {
    for (const light of lights) void load(light);
  }, [lights, load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, refreshMs);
    function onVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const flush = useCallback(
    async (id: number) => {
      const current = queue(id);
      if (current.inflight || !current.pending) return;

      const change = current.pending;
      current.pending = null;
      current.inflight = true;
      try {
        const state = await lightsApi.apply(id, change);
        if (!current.pending) {
          patch(id, (entry) => ({ ...entry, status: "ready", state, error: null }));
        }
      } catch (error) {
        const name = lights.find((light) => light.id === id)?.name;
        errorRef.current(name ? `${name}: ${message(error)}` : message(error));
        try {
          const state = await lightsApi.state(id);
          patch(id, (entry) => ({ ...entry, state }));
        } catch (reload) {
          patch(id, (entry) => ({ ...entry, status: "error", error: message(reload) }));
        }
      } finally {
        current.inflight = false;
        void flush(id);
      }
    },
    [lights, patch, queue],
  );

  const apply = useCallback(
    (id: number, change: LightChange) => {
      const current = queue(id);
      current.pending = mergeChange(current.pending, change);
      current.touched = Date.now();
      patch(id, (entry) => (entry.state ? { ...entry, state: applyChange(entry.state, change) } : entry));
      void flush(id);
    },
    [flush, patch, queue],
  );

  return { entries, apply, load };
}
