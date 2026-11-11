import { Link } from "react-router";
import { Icon } from "../icons";
import { courseName, mediaHref, type MoodleCourse } from "../../lib/moodle";

export function CourseCard({ course }: { course: MoodleCourse }) {
  const name = courseName(course.fullname);
  const short = courseName(course.shortname);

  return (
    <Link
      to={`/moodle/${course.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-ui-border-soft bg-ui-surface outline-none transition-colors hover:border-ui-border focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none"
    >
      <div className="relative aspect-[16/6] bg-[color-mix(in_oklab,var(--accent)_12%,var(--ui-surface))]">
        {course.has_image ? (
          <img
            src={mediaHref("image", course.id)}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-[var(--accent)]">
            <Icon name="moodle" className="size-7" />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-medium text-ui-fg group-hover:text-[var(--accent-fg)]">
          {name}
        </p>
        {short !== name && (
          <span className="mt-auto truncate pt-1 font-mono text-xs text-ui-fg-muted">{short}</span>
        )}
      </div>
    </Link>
  );
}
