import { Link } from "react-router";
import {
  calendarHref,
  formatDay,
  monthLong,
  monthWeeks,
  sameDay,
  toDay,
  weekDays,
  weekdayNarrow,
} from "../../lib/calendar";

type YearViewProps = {
  date: Date;
  today: Date;
};

export function YearView({ date, today }: YearViewProps) {
  const year = date.getUTCFullYear();
  const months = Array.from({ length: 12 }, (_, month) => toDay(year, month, 1));

  return (
    <div className="grid min-h-[36rem] flex-1 auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {months.map((month) => (
        <MiniMonth key={formatDay(month)} month={month} today={today} />
      ))}
    </div>
  );
}

function MiniMonth({ month, today }: { month: Date; today: Date }) {
  const current =
    month.getUTCFullYear() === today.getUTCFullYear() &&
    month.getUTCMonth() === today.getUTCMonth();

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-ui-border bg-ui-raised p-3">
      <Link
        to={calendarHref("month", month)}
        className={`self-start rounded px-1 text-sm font-semibold outline-none transition-colors hover:text-[var(--accent-fg)] focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none ${
          current ? "text-[var(--accent-fg)]" : "text-ui-fg"
        }`}
      >
        {monthLong.format(month)}
      </Link>

      <div className="mt-2 grid grid-cols-7 text-center text-[10px] font-medium text-ui-fg-faint uppercase">
        {weekDays(month).map((day) => (
          <span key={formatDay(day)}>{weekdayNarrow.format(day)}</span>
        ))}
      </div>

      <div className="mt-1 grid flex-1 grid-cols-7 grid-rows-6">
        {monthWeeks(month)
          .flat()
          .map((day) =>
            day.getUTCMonth() === month.getUTCMonth() ? (
              <Link
                key={formatDay(day)}
                to={calendarHref("week", day)}
                className="group grid min-h-0 place-items-center outline-none"
              >
                <span
                  className={`grid size-6 place-items-center rounded-full text-xs tabular-nums transition-colors group-hover:bg-ui-hover group-focus-visible:ring-2 group-focus-visible:ring-ui-ring motion-reduce:transition-none ${
                    sameDay(day, today)
                      ? "bg-[var(--accent)] font-semibold text-ui-frame group-hover:bg-[var(--accent)]"
                      : "text-ui-fg"
                  }`}
                >
                  {day.getUTCDate()}
                </span>
              </Link>
            ) : (
              <span key={formatDay(day)} />
            ),
          )}
      </div>
    </section>
  );
}
