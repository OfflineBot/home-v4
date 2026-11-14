import { useState } from "react";
import { Block } from "../block";
import { Icon } from "../icons";
import { buttonClass, inputClass, primaryButtonClass } from "../setting-row";
import {
  lightsApi,
  maxSleepMinutes,
  minSleepMinutes,
  type SleepTimerEntry,
} from "../../lib/light";

function remainingLabel(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

type SleepTimerProps = {
  timers: SleepTimerEntry[];
  onFailure: (message: string) => void;
  onChanged: () => void;
};

// The countdown lives on the devices, not here: a wled strip fades itself out
// with its nightlight, a plug drops out on its own timer. Closing the page or
// restarting the server cannot leave the room lit.
export function SleepTimer({ timers, onFailure, onChanged }: SleepTimerProps) {
  const [minutes, setMinutes] = useState("30");
  const [fade, setFade] = useState(true);
  const [busy, setBusy] = useState(false);

  const wanted = Number(minutes);
  const valid =
    Number.isInteger(wanted) &&
    wanted >= minSleepMinutes &&
    wanted <= maxSleepMinutes;

  async function run(next: number | null, id?: number) {
    setBusy(true);
    try {
      const result = await lightsApi.sleep(next, fade, id);
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

  return (
    <Block title="Sleep timer">
      {timers.length > 0 && (
        <ul className="mb-4 flex flex-col divide-y divide-ui-border-soft">
          {timers.map((timer) => (
            <li
              key={timer.light_id}
              className="flex flex-wrap items-center gap-3 py-2 first:pt-0"
            >
              <Icon
                name="clock"
                className="size-4 shrink-0 text-[var(--accent)]"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-ui-fg">
                {timer.name}
                <span className="ml-2 text-ui-fg-muted tabular-nums">
                  off in {remainingLabel(timer.sleep_in)}
                </span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(null, timer.light_id)}
                className={buttonClass}
              >
                Stop
              </button>
            </li>
          ))}
          {timers.length > 1 && (
            <li className="flex justify-end pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(null)}
                className={buttonClass}
              >
                Stop all
              </button>
            </li>
          )}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-ui-fg-muted">Minutes</span>
          <input
            type="number"
            inputMode="numeric"
            min={minSleepMinutes}
            max={maxSleepMinutes}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            className={`${inputClass} w-24 tabular-nums`}
          />
        </label>

        <label className="flex items-center gap-2 pb-2 text-sm text-ui-fg-muted">
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
          disabled={busy || !valid}
          onClick={() => run(wanted)}
          className={`${primaryButtonClass} ml-auto inline-flex items-center gap-1.5`}
        >
          <Icon name="power" className="size-4" />
          {busy ? "Arming…" : "Start"}
        </button>
      </div>

      <p className="mt-2 text-xs text-ui-fg-faint">
        {minSleepMinutes} to {maxSleepMinutes} minutes. The countdown runs on
        the devices, so it keeps going when this page is closed. Plugs cannot
        dim and simply switch off at the end.
      </p>
    </Block>
  );
}
