import { useEffect, useState } from "react";
import { Block } from "../block";
import { Icon } from "../icons";
import {
  buttonClass,
  inputClass,
  primaryButtonClass,
} from "../setting-row";
import {
  lightsApi,
  maxSleepMinutes,
  minSleepMinutes,
  type SleepTimerEntry,
} from "../../lib/light";

function remainingLabel(seconds: number) {
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  }

  const minutes = Math.ceil(seconds / 60);
  const rest = minutes % 60;
  const hours = Math.floor(minutes / 60);
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

// the devices count down on their own, so the page only has to tick along
// between the status reads instead of asking every second
function useCountdown(timers: SleepTimerEntry[]) {
  const [seen, setSeen] = useState(timers);
  const [since, setSince] = useState(() => Date.now());
  const [, setTick] = useState(0);

  if (seen !== timers) {
    setSeen(timers);
    setSince(Date.now());
  }

  const running = timers.length > 0;

  useEffect(() => {
    if (!running) return;
    const handle = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(handle);
  }, [running]);

  return (seconds: number) =>
    Math.max(0, seconds - Math.floor((Date.now() - since) / 1000));
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
  const [editing, setEditing] = useState(false);
  const left = useCountdown(timers);

  const wanted = Number(minutes);
  const valid =
    Number.isInteger(wanted) &&
    wanted >= minSleepMinutes &&
    wanted <= maxSleepMinutes;

  // with a countdown running the form stays folded away: an extra tap on
  // Start would silently restart the timer instead of doing nothing
  const showForm = timers.length === 0 || editing;

  async function run(next: number | null, lights?: number[]) {
    setBusy(true);
    try {
      const result = await lightsApi.sleep(next, fade, lights);
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
      setEditing(false);
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
        <ul className="flex flex-col gap-2">
          {timers.map((timer) => (
            <li
              key={timer.lights.join("-")}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-ui-border-soft bg-ui-surface p-3"
            >
              <Icon
                name="clock"
                className="size-5 shrink-0 text-[var(--accent)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ui-fg">
                  {timer.name}
                </span>
                <span className="block text-xs text-ui-fg-muted">
                  {timer.fade
                    ? "dimming down the whole time"
                    : "switches off at the end"}
                </span>
              </span>
              <span className="text-lg text-ui-fg tabular-nums">
                {remainingLabel(left(timer.sleep_in))}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(null, timer.lights)}
                className={`${buttonClass} h-10 w-full px-5 sm:w-auto`}
              >
                Stop
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-3">
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
              {busy ? "Arming…" : timers.length > 0 ? "Replace" : "Start"}
            </button>
          </div>

          <p className="mt-2 text-xs text-ui-fg-faint">
            {minSleepMinutes} to {maxSleepMinutes} minutes. A fade dims the
            strips down over the whole time and reaches nothing at the end;
            without it they stay bright and drop out at once. Plugs cannot dim
            either way. The countdown runs on the devices, so it keeps going
            when this page is closed.
          </p>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`${buttonClass} mt-3`}
        >
          New timer
        </button>
      )}
    </Block>
  );
}
