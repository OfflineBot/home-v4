import { useState } from "react";
import { Icon } from "./icons";
import { inputClass } from "./setting-row";
import {
  addMonths,
  dayLong,
  formatDay,
  monthWeeks,
  monthYear,
  parseDay,
  sameDay,
  startOfMonth,
  todayIn,
  weekDays,
  weekdayNarrow,
} from "../lib/calendar";

const stepClass =
  "grid size-7 cursor-pointer place-items-center rounded-md text-ui-fg-muted outline-none transition-colors hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none";

type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  labelledBy?: string;
};

export function DatePicker({ value, onChange, labelledBy }: DatePickerProps) {
  const selected = parseDay(value);
  const today = todayIn();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(selected ?? today));

  function toggle() {
    if (!open && selected) setMonth(startOfMonth(selected));
    setOpen(!open);
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-labelledby={labelledBy}
        className={`${inputClass} flex cursor-pointer items-center justify-between gap-2 text-left`}
      >
        <span className="truncate tabular-nums">
          {selected ? dayLong.format(selected) : "Pick a date"}
        </span>
        <Icon name="calendar" className="size-4 shrink-0 text-ui-fg-muted" />
      </button>

      <div
        inert={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-2 rounded-lg border border-ui-border-soft bg-ui-surface p-2">
            <div className="mb-1 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMonth(addMonths(month, -1))}
                aria-label="Previous month"
                className={stepClass}
              >
                <Icon name="chevron" className="size-4 rotate-180" />
              </button>
              <span className="flex-1 text-center text-sm font-medium text-ui-fg">
                {monthYear.format(month)}
              </span>
              <button
                type="button"
                onClick={() => setMonth(addMonths(month, 1))}
                aria-label="Next month"
                className={stepClass}
              >
                <Icon name="chevron" className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 text-center text-[10px] font-medium text-ui-fg-faint uppercase">
              {weekDays(month).map((day) => (
                <span key={formatDay(day)} className="py-1">
                  {weekdayNarrow.format(day)}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {monthWeeks(month)
                .flat()
                .map((day) => {
                  const active = selected !== null && sameDay(day, selected);
                  const inMonth = day.getUTCMonth() === month.getUTCMonth();

                  return (
                    <button
                      key={formatDay(day)}
                      type="button"
                      onClick={() => {
                        onChange(formatDay(day));
                        setOpen(false);
                      }}
                      aria-pressed={active}
                      aria-label={dayLong.format(day)}
                      className={`mx-auto grid size-8 cursor-pointer place-items-center rounded-full text-xs tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none ${
                        active
                          ? "bg-[var(--accent)] font-semibold text-ui-frame"
                          : sameDay(day, today)
                            ? "font-semibold text-[var(--accent-fg)] hover:bg-ui-hover"
                            : inMonth
                              ? "text-ui-fg hover:bg-ui-hover"
                              : "text-ui-fg-faint hover:bg-ui-hover"
                      }`}
                    >
                      {day.getUTCDate()}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
