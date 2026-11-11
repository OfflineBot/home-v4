import type { ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "../icons";
import { primaryButtonClass } from "../setting-row";
import {
  calendarHref,
  calendarViews,
  isoWeek,
  periodTitle,
  shiftDate,
  type CalendarView,
} from "../../lib/calendar";

export const controlClass =
  "grid h-9 shrink-0 place-items-center rounded-md border border-ui-border bg-ui-field text-sm text-ui-fg outline-none transition-colors hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none";

type CalendarToolbarProps = {
  view: CalendarView;
  date: Date;
  filter: ReactNode;
  onCreate: () => void;
};

export function CalendarToolbar({
  view,
  date,
  filter,
  onCreate,
}: CalendarToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="mr-auto flex min-w-0 items-baseline gap-2.5">
        <h2 className="truncate text-lg font-semibold text-ui-fg tabular-nums">
          {periodTitle(view, date)}
        </h2>
        {view === "week" && (
          <span className="shrink-0 text-sm text-ui-fg-muted tabular-nums">
            Week {isoWeek(date)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Link
          to={calendarHref(view, shiftDate(view, date, -1))}
          preventScrollReset
          aria-label={`Previous ${view}`}
          className={`${controlClass} w-9`}
        >
          <Icon name="chevron" className="size-4 rotate-180" />
        </Link>
        <Link
          to={calendarHref(view)}
          preventScrollReset
          className={`${controlClass} px-3`}
        >
          Today
        </Link>
        <Link
          to={calendarHref(view, shiftDate(view, date, 1))}
          preventScrollReset
          aria-label={`Next ${view}`}
          className={`${controlClass} w-9`}
        >
          <Icon name="chevron" className="size-4" />
        </Link>
      </div>

      <nav
        aria-label="Calendar view"
        className="inline-flex rounded-md border border-ui-border bg-ui-field p-0.5"
      >
        {calendarViews.map((item) => {
          const active = item.value === view;

          return (
            <Link
              key={item.value}
              to={calendarHref(item.value, date)}
              preventScrollReset
              aria-current={active ? "page" : undefined}
              className={`grid h-8 place-items-center rounded px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none ${
                active
                  ? "bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] font-medium text-[var(--accent-fg)]"
                  : "text-ui-fg-muted hover:text-ui-fg"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {filter}

      <button
        type="button"
        onClick={onCreate}
        className={`${primaryButtonClass} inline-flex items-center gap-1.5`}
      >
        <Icon name="plus" className="size-4" />
        New event
      </button>
    </div>
  );
}
