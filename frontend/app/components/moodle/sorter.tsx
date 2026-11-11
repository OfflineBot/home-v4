import { Badge, Block } from "../block";
import { buttonClass } from "../setting-row";
import { useSubmission } from "../use-submission";
import {
  courseName,
  semesterLabel,
  type MoodleCourse,
  type MoodleSemester,
} from "../../lib/moodle";

type Placement = { course_id: number; semester: number; position: number };

export function CourseSorter({ semesters }: { semesters: MoodleSemester[] }) {
  const highest = Math.max(0, ...semesters.map((entry) => entry.semester));
  const options = [
    ...Array.from({ length: Math.max(8, highest + 1) }, (_, index) => index + 1),
    0,
  ];

  return (
    <div className="flex flex-col gap-4">
      {semesters.map((entry) => (
        <Block
          key={entry.semester}
          title={semesterLabel(entry.semester)}
          status={<Badge>{entry.courses.length}</Badge>}
        >
          <ul className="flex flex-col divide-y divide-ui-border-soft">
            {entry.courses.map((course) => (
              <SortRow
                key={course.id}
                course={course}
                semester={entry.semester}
                options={options}
              />
            ))}
          </ul>
        </Block>
      ))}
    </div>
  );
}

type SortRowProps = {
  course: MoodleCourse;
  semester: number;
  options: number[];
};

function SortRow({ course, semester, options }: SortRowProps) {
  const { fetcher, busy, toast } = useSubmission();
  const name = courseName(course.fullname);

  function place(placements: Placement[]) {
    fetcher.submit(
      { intent: "place", placements: JSON.stringify(placements) },
      { method: "post" },
    );
  }

  return (
    <li className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
      <span className="min-w-0 flex-1 truncate text-sm text-ui-fg">{name}</span>
      {course.placement?.custom && <Badge>Moved</Badge>}
      <select
        aria-label={`Semester for ${name}`}
        value={semester}
        disabled={busy}
        onChange={(event) =>
          place([
            {
              course_id: course.id,
              semester: Number(event.target.value),
              position: 0,
            },
          ])
        }
        className="h-8 shrink-0 cursor-pointer rounded-md border border-ui-border-strong bg-ui-field px-2 text-sm text-ui-fg outline-none focus:border-ctp-mauve"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {semesterLabel(option)}
          </option>
        ))}
      </select>
      {course.placement?.custom && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            fetcher.submit(
              { intent: "reset", course: String(course.id) },
              { method: "post" },
            )
          }
          className={`${buttonClass} h-8`}
        >
          Reset
        </button>
      )}
      {toast}
    </li>
  );
}
