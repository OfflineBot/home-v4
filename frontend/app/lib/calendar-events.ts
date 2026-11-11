import { useEffect, useState } from "react";
import { formatDay, zonedStamp } from "./calendar";

export type EventMark = "normal" | "important" | "hidden";

export const eventMarks: { value: EventMark; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "important", label: "Important" },
  { value: "hidden", label: "Hidden" },
];

export type CalendarCategory = {
  id: string;
  name: string;
  color: string;
  source?: string;
  hidden: boolean;
};

export type CalendarEvent = {
  id: string;
  source: "custom" | "timetable";
  title: string;
  start: string;
  end: string;
  categoryId: string;
  room: string;
  description: string;
  mark: EventMark;
  teacher?: string;
  kind?: string;
  online?: boolean;
  cancelled?: boolean;
};

export type EventDraft = Omit<CalendarEvent, "id"> & { id?: string };

export type CategoryDraft = Omit<CalendarCategory, "id"> & { id?: string };

export type PlacedEvent = {
  event: CalendarEvent;
  lane: number;
  lanes: number;
};

type CalendarItem = {
  id: string;
  source: string;
  category_id: string;
  title: string;
  start: string;
  end: string;
  room: string;
  description: string;
  mark: EventMark;
  teacher?: string;
  type?: string;
  is_online: boolean;
  is_cancelled: boolean;
};

const endpoint = "/calendar/api";

const errorMessages: Record<string, string> = {
  invalid_event: "Check the title, date and times.",
  invalid_category: "The name or the color is not valid.",
  invalid_mark: "This mark is not valid.",
  protected: "The DHBW timetable category cannot be deleted.",
  not_found: "This entry no longer exists.",
};

export class CalendarError extends Error {
  constructor(code: string, status: number) {
    super(errorMessages[code] ?? `Failed (${status})`);
  }
}

function fromItem(item: CalendarItem): CalendarEvent {
  return {
    id: item.id,
    source: item.source === "custom" ? "custom" : "timetable",
    title: item.title,
    start: zonedStamp(new Date(item.start)),
    end: zonedStamp(new Date(item.end)),
    categoryId: item.category_id,
    room: item.room,
    description: item.description,
    mark: item.mark,
    teacher: item.teacher,
    kind: item.type,
    online: item.is_online,
    cancelled: item.is_cancelled,
  };
}

async function send<T>(body: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CalendarError("unreachable", 0);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new CalendarError(data.error ?? "failed", res.status);
  return data as T;
}

export const calendarApi = {
  async events(from: Date, to: Date) {
    const params = new URLSearchParams({ from: formatDay(from), to: formatDay(to) });

    try {
      const res = await fetch(`${endpoint}?${params}`);
      if (!res.ok) return [];
      const data = (await res.json()) as { events?: CalendarItem[] };
      return (data.events ?? []).map(fromItem);
    } catch {
      return [];
    }
  },

  async saveEvent(draft: EventDraft) {
    const item = await send<CalendarItem>({
      intent: "save-event",
      event: {
        id: draft.id ?? "",
        category_id: draft.categoryId,
        title: draft.title,
        start: draft.start,
        end: draft.end,
        room: draft.room,
        description: draft.description,
        mark: draft.mark,
      },
    });
    return fromItem(item);
  },

  deleteEvent(id: string) {
    return send({ intent: "delete-event", id });
  },

  setMark(event: CalendarEvent, mark: EventMark) {
    return send({ intent: "mark-event", id: event.id, mark });
  },

  saveCategory(draft: CategoryDraft) {
    return send<CalendarCategory>({
      intent: "save-category",
      category: {
        id: draft.id ?? "",
        name: draft.name,
        color: draft.color,
        hidden: draft.hidden,
      },
    });
  },

  deleteCategory(id: string) {
    return send({ intent: "delete-category", id });
  },
};

const cache = new Map<string, CalendarEvent[]>();

export function invalidateEvents() {
  cache.clear();
}

export function useCalendarEvents(from: Date, to: Date, revision: number) {
  const range = `${formatDay(from)}/${formatDay(to)}`;
  const key = `${range}@${revision}`;
  const [loaded, setLoaded] = useState<{
    range: string;
    events: CalendarEvent[];
  } | null>(null);

  useEffect(() => {
    const cached = cache.get(key);
    if (cached) {
      setLoaded({ range, events: cached });
      return;
    }

    let active = true;
    calendarApi.events(from, to).then((events) => {
      cache.set(key, events);
      if (active) setLoaded({ range, events });
    });
    return () => {
      active = false;
    };
  }, [key]);

  const cached = cache.get(key);
  if (cached) return cached;
  return loaded?.range === range ? loaded.events : null;
}

export function minutesOf(value: string) {
  const [hours, minutes] = value.slice(11, 16).split(":").map(Number);
  return hours * 60 + minutes;
}

export function eventsOn(
  events: CalendarEvent[],
  day: Date,
  categories: Map<string, CalendarCategory>,
  showHidden: boolean,
) {
  const key = formatDay(day);
  return events
    .filter(
      (event) =>
        event.start.startsWith(key) &&
        categories.has(event.categoryId) &&
        (showHidden || event.mark !== "hidden"),
    )
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function layoutDay(events: CalendarEvent[]) {
  const placed: PlacedEvent[] = [];
  let cluster: PlacedEvent[] = [];
  let clusterEnd = "";
  const laneEnds: string[] = [];

  function closeCluster() {
    for (const item of cluster) item.lanes = laneEnds.length;
    cluster = [];
    laneEnds.length = 0;
  }

  for (const event of events) {
    if (cluster.length > 0 && event.start >= clusterEnd) closeCluster();

    let lane = laneEnds.findIndex((end) => end <= event.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(event.end);
    } else {
      laneEnds[lane] = event.end;
    }

    const item = { event, lane, lanes: 1 };
    cluster.push(item);
    placed.push(item);
    if (cluster.length === 1 || event.end > clusterEnd) clusterEnd = event.end;
  }
  closeCluster();

  return placed;
}
