import { useState } from "react";
import type { Route } from "./+types/moodle";
import { Badge, ExpandableBlock, Stack } from "../components/block";
import { EmptySync } from "../components/empty-sync";
import { Icon } from "../components/icons";
import { CourseCard } from "../components/moodle/course-card";
import { CourseSorter } from "../components/moodle/sorter";
import { Page } from "../components/page";
import { buttonClass } from "../components/setting-row";
import { SyncButton } from "../components/sync-button";
import type { ActionResult } from "../components/use-submission";
import { api, unreachableStatus } from "../lib/api";
import { isConnected } from "../lib/connections.server";
import {
  arrangeSemesters,
  semesterLabel,
  type MoodleSemester,
} from "../lib/moodle";
import { navColor } from "../lib/nav";
import { requireToken } from "../lib/session";
import { syncState } from "../lib/sync.server";

type Placement = { course_id: number; semester: number; position: number };

export function meta() {
  return [{ title: "Moodle" }];
}

const activeWindowDays = 42;

function dayOffset(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function timetableTitles(token: string) {
  const params = new URLSearchParams({
    from: dayOffset(-activeWindowDays),
    to: dayOffset(activeWindowDays),
    sources: "timetable",
  });
  const res = await api(`/api/calendar/events?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    events?: { title: string; source: string }[];
  };
  return (data.events ?? [])
    .filter((event) => event.source !== "custom")
    .map((event) => event.title);
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const [list, titles, sync, connected] = await Promise.all([
    api("/api/moodle/semesters", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    timetableTitles(token),
    syncState(token, "moodle"),
    isConnected(token, "moodle"),
  ]);
  const semesters: MoodleSemester[] = list.ok
    ? ((await list.json()).semesters ?? [])
    : [];

  return {
    ...arrangeSemesters(
      semesters.filter((entry) => entry.courses.length > 0),
      titles,
    ),
    sync,
    connected,
  };
}

function parsePlacements(raw: string): Placement[] | null {
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    const valid = value.every(
      (entry) =>
        Number.isInteger(entry?.course_id) &&
        Number.isInteger(entry?.semester) &&
        Number.isInteger(entry?.position),
    );
    return valid ? value : null;
  } catch {
    return null;
  }
}

export async function action({
  request,
}: Route.ActionArgs): Promise<ActionResult> {
  const token = await requireToken(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  let res: Response;
  if (intent === "place") {
    const placements = parsePlacements(String(form.get("placements") ?? ""));
    if (!placements) return { ok: false, message: "Invalid order." };
    res = await api("/api/moodle/placements", {
      method: "POST",
      headers,
      body: JSON.stringify({ placements }),
    });
  } else if (intent === "reset") {
    const course = Number(form.get("course"));
    if (!Number.isInteger(course)) return { ok: false, message: "Unknown course." };
    res = await api(`/api/moodle/courses/${course}/placement/delete`, {
      method: "POST",
      headers,
    });
  } else {
    return { ok: false, message: "Unknown action" };
  }

  if (res.ok) return { ok: true, message: "Saved." };
  if (res.status === unreachableStatus) {
    return { ok: false, message: "Backend not reachable" };
  }
  return { ok: false, message: `Failed (${res.status})` };
}

function SemesterGroup({
  entry,
  current,
}: {
  entry: MoodleSemester;
  current: boolean;
}) {
  return (
    <ExpandableBlock
      title={semesterLabel(entry.semester)}
      icon={entry.semester > 0 ? "moodle" : "pages"}
      color={navColor("moodle")}
      defaultOpen={current}
      summary={
        <>
          {current && <Badge tone="accent">Current</Badge>}
          <Badge>{entry.courses.length} courses</Badge>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {entry.courses.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>
    </ExpandableBlock>
  );
}

export default function Moodle({ loaderData }: Route.ComponentProps) {
  const { semesters, current, sync, connected } = loaderData;
  const [sorting, setSorting] = useState(false);

  return (
    <Page
      title="Moodle"
      icon="moodle"
      color={navColor("moodle")}
      actions={
        <>
          {semesters.length > 0 && (
            <button
              type="button"
              onClick={() => setSorting(!sorting)}
              aria-pressed={sorting}
              className={`${buttonClass} inline-flex items-center gap-1.5 ${
                sorting ? "border-[var(--accent)] text-[var(--accent-fg)]" : ""
              }`}
            >
              <Icon name={sorting ? "check" : "filter"} className="size-4" />
              {sorting ? "Done" : "Sort courses"}
            </button>
          )}
          <SyncButton job="moodle" state={sync} />
        </>
      }
    >
      {semesters.length === 0 ? (
        <EmptySync connected={connected} />
      ) : sorting ? (
        <CourseSorter semesters={semesters} />
      ) : (
        <Stack>
          {semesters.map((entry) => (
            <SemesterGroup
              key={entry.semester}
              entry={entry}
              current={entry.semester === current}
            />
          ))}
        </Stack>
      )}
    </Page>
  );
}
