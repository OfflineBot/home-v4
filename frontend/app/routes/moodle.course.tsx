import type { Route } from "./+types/moodle.course";
import { Badge, Block, Stack } from "../components/block";
import { Icon } from "../components/icons";
import { SectionBlock } from "../components/moodle/section";
import { Page } from "../components/page";
import { buttonClass, primaryButtonClass } from "../components/setting-row";
import { api } from "../lib/api";
import { courseHref, courseName, type MoodleCourseDetail } from "../lib/moodle";
import { navColor } from "../lib/nav";
import { requireToken } from "../lib/session";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData?.course ? courseName(loaderData.course.fullname) : "Moodle" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Response("Not found", { status: 404 });
  }

  const res = await api(`/api/moodle/courses/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) throw new Response("Not found", { status: 404 });
  if (!res.ok) throw new Response("Moodle is not available", { status: 502 });

  return (await res.json()) as MoodleCourseDetail;
}

export default function MoodleCourse({ loaderData }: Route.ComponentProps) {
  const { course } = loaderData;
  const sections = (loaderData.sections ?? []).filter(
    (section) => (section.modules ?? []).length > 0 || section.summary,
  );
  const grades = loaderData.grades ?? [];

  return (
    <Page
      title={courseName(course.fullname)}
      icon="moodle"
      color={navColor("moodle")}
      back={{ to: "/moodle", label: "Moodle" }}
      actions={
        <>
          <a
            href={courseHref(course.id)}
            target="_blank"
            rel="noreferrer"
            className={`${buttonClass} inline-flex items-center`}
          >
            Open in Moodle
          </a>
          <a
            href={`/moodle/${course.id}/zip`}
            download
            className={`${primaryButtonClass} inline-flex items-center gap-1.5`}
          >
            <Icon name="files" className="size-4" />
            Download ZIP
          </a>
        </>
      }
    >
      <Stack>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-ui-fg-muted">
            {course.shortname}
          </span>
          {course.semester && <Badge>{course.semester}</Badge>}
        </div>

        {sections.length === 0 && (
          <Block>
            <p className="text-sm text-ui-fg-muted">
              This course has no content yet.
            </p>
          </Block>
        )}

        {sections.map((section, index) => (
          <SectionBlock
            key={section.id}
            section={section}
            defaultOpen={index < 3}
          />
        ))}

        {grades.length > 0 && (
          <Block title="Grades">
            <ul className="flex flex-col divide-y divide-ui-border-soft">
              {grades.map((grade) => (
                <li
                  key={grade.id}
                  className="flex items-center gap-3 py-2 text-sm first:pt-0 last:pb-0"
                >
                  <span className="min-w-0 flex-1 truncate text-ui-fg">
                    {grade.name || "Course total"}
                  </span>
                  {grade.passed === false && <Badge tone="bad">Failed</Badge>}
                  <span className="shrink-0 font-semibold text-ui-fg tabular-nums">
                    {grade.formatted || "/"}
                  </span>
                </li>
              ))}
            </ul>
          </Block>
        )}
      </Stack>
    </Page>
  );
}
