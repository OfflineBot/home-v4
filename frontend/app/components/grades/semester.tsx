import { Badge, ExpandableBlock } from "../block";
import { Icon } from "../icons";
import {
  averageGrade,
  earnedECTS,
  formatAverage,
  formatECTS,
  formatGrade,
  statusLabel,
  statusTone,
  type Grade,
  type Semester,
} from "../../lib/grades";
import { navColor } from "../../lib/nav";

const gradeColor = {
  passed: "text-ui-fg",
  failed: "text-ui-danger",
  pending: "text-ui-fg-faint",
};

type SemesterBlockProps = {
  semester: Semester;
  selectedId: number | null;
  onSelect: (module: Grade) => void;
  defaultOpen?: boolean;
};

export function SemesterBlock({
  semester,
  selectedId,
  onSelect,
  defaultOpen,
}: SemesterBlockProps) {
  return (
    <ExpandableBlock
      title={semester.name}
      icon="grades"
      color={navColor("grades")}
      defaultOpen={defaultOpen}
      summary={
        <>
          <Badge>Ø {formatAverage(averageGrade(semester.modules))}</Badge>
          <Badge>{formatECTS(earnedECTS(semester.modules))} ECTS</Badge>
        </>
      }
    >
      <ul className="-mx-2 flex flex-col gap-0.5">
        {semester.modules.map((module) => (
          <li key={module.id}>
            <ModuleRow
              module={module}
              selected={module.id === selectedId}
              onSelect={() => onSelect(module)}
            />
          </li>
        ))}
      </ul>
    </ExpandableBlock>
  );
}

type ModuleRowProps = {
  module: Grade;
  selected: boolean;
  onSelect: () => void;
};

function ModuleRow({ module, selected, onSelect }: ModuleRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-controls="grade-detail"
      className={`flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ui-ring ${
        selected
          ? "bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]"
          : "hover:bg-ui-hover"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ui-fg">
          {module.name}
        </span>
        <span className="block truncate font-mono text-xs text-ui-fg-muted">
          {module.module_id}
        </span>
      </span>

      {module.status !== "passed" && (
        <Badge tone={statusTone[module.status]}>
          {statusLabel[module.status]}
        </Badge>
      )}
      <span className="w-16 shrink-0 text-right text-xs text-ui-fg-muted tabular-nums">
        {formatECTS(module.ects)} ECTS
      </span>
      <span
        className={`w-10 shrink-0 text-right text-base font-semibold tabular-nums ${gradeColor[module.status]}`}
      >
        {formatGrade(module.grade)}
      </span>
      <span
        className={`grid size-4 shrink-0 place-items-center ${
          selected ? "text-[var(--accent)]" : "text-ui-fg-faint"
        }`}
      >
        <Icon name="chevron" className="size-4" />
      </span>
    </button>
  );
}
