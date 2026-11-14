import { useEffect, useState } from "react";
import { Block } from "../block";
import { Icon } from "../icons";
import { buttonClass, primaryButtonClass } from "../setting-row";
import { lightsApi, sleepPresets } from "../../lib/light";

const tickMs = 30_000;

function remainingLabel(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

type SleepTimerProps = {
  armedFor: number;
  onFailure: (message: string) => void;
  onChanged: () => void;
};

// The countdown lives on the devices, not here: a wled strip fades itself out
// with its nightlight, a plug drops out on its own timer. Closing the page or
// restarting the server cannot leave the room lit.
export function SleepTimer({
  armedFor,
  onFailure,
  onChanged,
}: SleepTimerProps) {
  const [minutes, setMinutes] = useState(30);
  const [fade, setFade] = useState(true);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(armedFor);

  useEffect(() => setLeft(armedFor), [armedFor]);

  useEffect(() => {
    if (left <= 0) return;

    const timer = window.setInterval(() => {
      setLeft((current) => Math.max(0, current - tickMs / 1000));
    }, tickMs);
    return () => window.clearInterval(timer);
  }, [left]);

  async function run(next: number | null) {
    setBusy(true);
    try {
      const result = await lightsApi.sleep(next, fade);
      if (next !== null && result.armed === 0) {
        onFailure("No light is on.");
      }
      if (result.failed.length > 0) {
        onFailure(
          result.failed.length === 1
            ? "One light did not take the timer."
            : `${result.failed.length} lights did not take the timer.`,
        );
      }
      onChanged();
    } catch {
      onFailure("The lights could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  if (left > 0) {
    return (
      <Block title="Sleep timer">
        <div className="flex flex-wrap items-center gap-3">
          <Icon name="clock" className="size-4 shrink-0 text-[var(--accent)]" />
          <p className="min-w-0 flex-1 text-sm text-ui-fg">
            Lights go off in{" "}
            <span className="font-medium tabular-nums">
              {remainingLabel(left)}
            </span>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(null)}
            className={buttonClass}
          >
            {busy ? "Working…" : "Cancel"}
          </button>
        </div>
      </Block>
    );
  }

  return (
    <Block title="Sleep timer">
      <div className="flex flex-wrap gap-2">
        {sleepPresets.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={minutes === preset}
            onClick={() => setMinutes(preset)}
            className={`${
              minutes === preset ? primaryButtonClass : buttonClass
            } tabular-nums`}
          >
            {preset} min
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-ui-fg-muted">
          <input
            type="checkbox"
            checked={fade}
            onChange={(event) => setFade(event.target.checked)}
            className="size-4 accent-ctp-mauve"
          />
          Fade out slowly
        </label>

        <button
          type="button"
          disabled={busy}
          onClick={() => run(minutes)}
          className={`${primaryButtonClass} ml-auto inline-flex items-center gap-1.5`}
        >
          <Icon name="power" className="size-4" />
          {busy ? "Arming…" : `Off in ${minutes} min`}
        </button>
      </div>

      <p className="mt-2 text-xs text-ui-fg-faint">
        The countdown runs on the devices, so it keeps going when this page is
        closed. Plugs cannot dim and simply switch off at the end.
      </p>
    </Block>
  );
}
