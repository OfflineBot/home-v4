import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/calendar";
import { CategoryDialog } from "../components/calendar/category-dialog";
import { CategoryFilter } from "../components/calendar/category-filter";
import { EventDialog } from "../components/calendar/event-dialog";
import { MonthView } from "../components/calendar/month-view";
import { CalendarToolbar } from "../components/calendar/toolbar";
import { WeekView } from "../components/calendar/week-view";
import { YearView } from "../components/calendar/year-view";
import { Page } from "../components/page";
import { Toast } from "../components/toast";
import { api } from "../lib/api";
import {
  calendarHref,
  calendarState,
  formatDay,
  formatTime,
  nowIn,
  parseDay,
  sameDay,
  shiftDate,
  todayIn,
  weekDays,
} from "../lib/calendar";
import {
  calendarApi,
  invalidateEvents,
  type CalendarCategory,
  type CalendarEvent,
  type CategoryDraft,
  type EventDraft,
  type EventMark,
} from "../lib/calendar-events";
import type { CourseRef, MoodleCourse } from "../lib/moodle";
import { navColor } from "../lib/nav";
import { requireToken } from "../lib/session";

const defaultStart = 9 * 60;
const defaultLength = 60;
const latestStart = 23 * 60;
const latestEnd = 24 * 60 - 1;

export function meta() {
  return [{ title: "Calendar" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const headers = { Authorization: `Bearer ${token}` };
  const [res, moodle] = await Promise.all([
    api("/api/calendar/categories", { headers }),
    api("/api/moodle/courses", { headers }),
  ]);
  const categories: CalendarCategory[] = res.ok
    ? ((await res.json()).categories ?? [])
    : [];
  const courses: CourseRef[] = moodle.ok
    ? (((await moodle.json()).courses ?? []) as MoodleCourse[]).map(
        (course) => ({
          id: course.id,
          fullname: course.fullname,
          semester: course.placement?.semester ?? course.semester_number,
        }),
      )
    : [];

  return { ...calendarState(new URL(request.url)), categories, courses };
}

export default function Calendar({ loaderData }: Route.ComponentProps) {
  const { view } = loaderData;
  const date = parseDay(loaderData.date) ?? todayIn();
  const today = parseDay(loaderData.today) ?? todayIn();
  const navigate = useNavigate();

  const [categories, setCategories] = useState(loaderData.categories);
  const [syncedCategories, setSyncedCategories] = useState(
    loaderData.categories,
  );
  const [revision, setRevision] = useState(() => Date.now());
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [managing, setManaging] = useState<"list" | "add" | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [failure, setFailure] = useState<{ message: string; attempt: number }>(
    { message: "", attempt: 0 },
  );

  if (loaderData.categories !== syncedCategories) {
    setSyncedCategories(loaderData.categories);
    setCategories(loaderData.categories);
  }

  const hidden = categories
    .filter((category) => category.hidden)
    .map((category) => category.id);

  const visible = useMemo(
    () =>
      new Map(
        categories
          .filter((category) => !category.hidden)
          .map((category) => [category.id, category]),
      ),
    [categories],
  );

  useEffect(() => {
    const anchor = parseDay(loaderData.date);

    function onKeyDown(event: KeyboardEvent) {
      if (!anchor || event.altKey || event.ctrlKey || event.metaKey) return;
      if (document.querySelector("dialog[open]")) return;
      if ((event.target as HTMLElement).closest("input, textarea, select")) {
        return;
      }

      const step =
        event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      if (step === 0) return;

      event.preventDefault();
      navigate(calendarHref(view, shiftDate(view, anchor, step)), {
        preventScrollReset: true,
      });
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [view, loaderData.date, navigate]);

  function refresh() {
    invalidateEvents();
    setRevision((current) => current + 1);
  }

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") refresh();
    }

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  function fail(error: unknown) {
    setFailure((current) => ({
      message: error instanceof Error ? error.message : "Something went wrong.",
      attempt: current.attempt + 1,
    }));
  }

  function upsertCategory(category: CalendarCategory) {
    setCategories((current) =>
      current.some((entry) => entry.id === category.id)
        ? current.map((entry) => (entry.id === category.id ? category : entry))
        : [...current, category],
    );
  }

  function openDraft(day: Date, minutes: number) {
    if (categories.length === 0) {
      setManaging("add");
      return;
    }

    const start = Math.min(minutes, latestStart);
    const key = formatDay(day);
    const category =
      categories.find((entry) => !entry.source && !entry.hidden) ??
      categories.find((entry) => !entry.hidden) ??
      categories[0];

    setDraft({
      source: "custom",
      title: "",
      categoryId: category.id,
      start: `${key}T${formatTime(start)}`,
      end: `${key}T${formatTime(Math.min(start + defaultLength, latestEnd))}`,
      room: "",
      description: "",
      mark: "normal",
    });
  }

  function createFromToolbar() {
    const now = nowIn();
    const day = weekDays(date).some((entry) => sameDay(entry, today))
      ? today
      : date;
    const minutes = sameDay(day, now.day)
      ? Math.ceil(now.minutes / 60) * 60
      : defaultStart;

    openDraft(day, minutes);
  }

  async function saveEvent(next: EventDraft) {
    try {
      await calendarApi.saveEvent(next);
      setDraft(null);
      refresh();
    } catch (error) {
      fail(error);
    }
  }

  async function deleteEvent(id: string) {
    try {
      await calendarApi.deleteEvent(id);
      setDraft(null);
      refresh();
    } catch (error) {
      fail(error);
    }
  }

  async function markEvent(event: CalendarEvent, mark: EventMark) {
    try {
      await calendarApi.setMark(event, mark);
      refresh();
    } catch (error) {
      fail(error);
    }
  }

  async function saveCategory(next: CategoryDraft) {
    try {
      upsertCategory(await calendarApi.saveCategory(next));
    } catch (error) {
      fail(error);
      throw error;
    }
  }

  async function deleteCategory(id: string) {
    try {
      await calendarApi.deleteCategory(id);
      setCategories((current) => current.filter((entry) => entry.id !== id));
      refresh();
    } catch (error) {
      fail(error);
    }
  }

  async function toggleCategory(id: string) {
    const category = categories.find((entry) => entry.id === id);
    if (!category) return;

    const next = { ...category, hidden: !category.hidden };
    upsertCategory(next);
    try {
      await calendarApi.saveCategory(next);
    } catch (error) {
      upsertCategory(category);
      fail(error);
    }
  }

  return (
    <Page title="Calendar" icon="calendar" color={navColor("calendar")}>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <CalendarToolbar
          view={view}
          date={date}
          onCreate={createFromToolbar}
          filter={
            <CategoryFilter
              categories={categories}
              hidden={hidden}
              showHidden={showHidden}
              onToggle={toggleCategory}
              onShowHidden={setShowHidden}
              onManage={() => setManaging("list")}
            />
          }
        />

        {view === "week" && (
          <WeekView
            date={date}
            today={today}
            categories={visible}
            showHidden={showHidden}
            revision={revision}
            onCreate={openDraft}
            onEdit={setDraft}
          />
        )}
        {view === "month" && (
          <MonthView
            date={date}
            today={today}
            categories={visible}
            showHidden={showHidden}
            revision={revision}
          />
        )}
        {view === "year" && <YearView date={date} today={today} />}
      </div>

      <EventDialog
        draft={draft}
        categories={categories}
        courses={loaderData.courses}
        onClose={() => setDraft(null)}
        onSave={saveEvent}
        onDelete={deleteEvent}
        onMark={markEvent}
      />
      <CategoryDialog
        open={managing !== null}
        adding={managing === "add"}
        categories={categories}
        onClose={() => setManaging(null)}
        onSave={saveCategory}
        onDelete={deleteCategory}
      />
      <Toast
        key={failure.attempt}
        message={failure.attempt > 0 ? failure.message : null}
      />
    </Page>
  );
}
