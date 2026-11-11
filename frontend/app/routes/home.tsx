import { useEffect, useMemo } from "react";
import { useRevalidator } from "react-router";
import type { Route } from "./+types/home";
import { ClockCard } from "../components/dashboard/clock-card";
import { LightsBlock } from "../components/dashboard/lights-block";
import { NotificationsBlock } from "../components/dashboard/notifications-block";
import { TodayBlock } from "../components/dashboard/today-block";
import { useTicker } from "../components/dashboard/use-ticker";
import { Page } from "../components/page";
import { api } from "../lib/api";
import { addDays, formatDay, todayIn } from "../lib/calendar";
import type { CalendarCategory } from "../lib/calendar-events";
import {
  agendaDays,
  gradeNotices,
  planDay,
  readSeen,
  type AgendaItem,
} from "../lib/dashboard";
import type { DHBWAccount } from "../lib/dhbw";
import type { Semester } from "../lib/grades";
import { listLights } from "../lib/light.server";
import type { MailFolder } from "../lib/mail";
import { homeItem } from "../lib/nav";
import { requireToken } from "../lib/session";

type CalendarItem = {
  id: string;
  category_id: string;
  title: string;
  start: string;
  end: string;
  room: string;
  mark: string;
  teacher?: string;
  type?: string;
  is_online: boolean;
  is_cancelled: boolean;
};

const refreshMs = 2 * 60_000;
const minuteMs = 60_000;

export function meta() {
  return [{ title: "Home" }];
}

async function json<T>(res: Response, fallback: T): Promise<T> {
  if (!res.ok) return fallback;
  return ((await res.json().catch(() => fallback)) ?? fallback) as T;
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const headers = { Authorization: `Bearer ${token}` };
  const today = todayIn();
  const range = new URLSearchParams({
    from: formatDay(today),
    to: formatDay(addDays(today, agendaDays)),
    visible: "true",
    marks: "normal,important",
  });

  const [eventsRes, categoriesRes, accountRes, foldersRes, gradesRes, lights] = await Promise.all([
    api(`/api/calendar/events?${range}`, { headers }),
    api("/api/calendar/categories", { headers }),
    api("/api/connections/dhbw", { headers }),
    api("/api/mail/folders", { headers }),
    api("/api/grades/list", { headers }),
    listLights(token),
  ]);

  const categories = (await json<{ categories?: CalendarCategory[] }>(categoriesRes, {})).categories ?? [];
  const byId = new Map(categories.map((category) => [category.id, category]));
  const rawEvents = (await json<{ events?: CalendarItem[] }>(eventsRes, {})).events ?? [];
  const agenda: AgendaItem[] = rawEvents
    .map((item) => ({
      id: item.id,
      title: item.title,
      start: Date.parse(item.start),
      end: Date.parse(item.end),
      room: item.room ?? "",
      teacher: item.teacher ?? "",
      kind: item.type ?? "",
      online: item.is_online === true,
      cancelled: item.is_cancelled === true,
      important: item.mark === "important",
      color: byId.get(item.category_id)?.color ?? "blue",
      category: byId.get(item.category_id)?.name ?? "",
    }))
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const account = await json<Partial<DHBWAccount> | null>(accountRes, null);
  const folders = foldersRes.ok
    ? ((await json<{ folders?: MailFolder[] }>(foldersRes, {})).folders ?? [])
    : null;
  const inbox = folders?.find((folder) => folder.role === "inbox") ?? folders?.find((folder) => folder.id === "inbox");

  const semesters = (await json<{ semesters?: Semester[] }>(gradesRes, {})).semesters ?? [];
  const notices = gradeNotices(semesters);
  const seen = readSeen(request.headers.get("Cookie"));

  return {
    now: Date.now(),
    agenda,
    calendarFailed: !eventsRes.ok,
    mail: {
      connected: account?.mail === true,
      unread: folders === null ? null : (inbox?.unread ?? 0),
    },
    grades: {
      fresh: seen ? notices.filter((notice) => !seen.has(notice.key)) : [],
      keys: notices.map((notice) => notice.key),
      baseline: seen === null,
    },
    lights,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { agenda, calendarFailed, mail, grades, lights } = loaderData;
  const revalidator = useRevalidator();
  const now = useTicker(loaderData.now, minuteMs);
  const plan = useMemo(() => planDay(agenda, now), [agenda, now]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") revalidator.revalidate();
    };
    const id = setInterval(refresh, refreshMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return (
    <Page title={homeItem.label} icon="home" color={homeItem.color}>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,26rem)]">
        <div className="flex min-w-0 flex-col gap-4">
          <ClockCard initial={loaderData.now} now={now} plan={plan} calendarFailed={calendarFailed} />
          <TodayBlock plan={plan} now={now} calendarFailed={calendarFailed} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <NotificationsBlock mail={mail} grades={grades} />
          <LightsBlock lights={lights} />
        </div>
      </div>
    </Page>
  );
}
