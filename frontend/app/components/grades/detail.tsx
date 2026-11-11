import { useEffect, useState } from "react";
import { Badge } from "../block";
import { Icon } from "../icons";
import {
  formatECTS,
  formatGrade,
  parseScore,
  statusLabel,
  statusTone,
  unsetGrade,
  type ExamAttempt,
  type Grade,
  type GradeStatus,
  type Score,
} from "../../lib/grades";

const panelWidth = "lg:w-[calc((100cqw-1rem)/3)]";

type View = {
  module: Grade;
  attempts: ExamAttempt[] | null;
};

type ModuleDetailProps = {
  module: Grade | null;
  attempts: ExamAttempt[] | null;
  onClose: () => void;
};

export function ModuleDetail({ module, attempts, onClose }: ModuleDetailProps) {
  const [last, setLast] = useState<View | null>(null);
  const open = module !== null;

  if (module && (last?.module !== module || last.attempts !== attempts)) {
    setLast({ module, attempts });
  }
  const view = module ? { module, attempts } : last;

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <aside
      id="grade-detail"
      aria-label="Module details"
      inert={!open}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={`shrink-0 overflow-hidden duration-300 ease-out motion-reduce:transition-none max-lg:fixed max-lg:inset-0 max-lg:z-40 max-lg:flex max-lg:justify-end max-lg:transition-[background-color,visibility] lg:sticky lg:top-0 lg:self-start lg:transition-[width,margin] ${
        open
          ? `max-lg:visible max-lg:bg-ui-frame/70 lg:ml-4 ${panelWidth}`
          : "max-lg:invisible max-lg:bg-transparent lg:ml-0 lg:w-0"
      }`}
    >
      <section
        className={`overflow-hidden rounded-xl border border-ui-border bg-ui-raised duration-300 ease-out motion-reduce:transition-none max-lg:h-full max-lg:w-full max-lg:overflow-y-auto max-lg:rounded-none max-lg:border-y-0 max-lg:border-r-0 max-lg:transition-[translate] sm:max-lg:w-[28rem] ${panelWidth} ${
          open ? "translate-x-0" : "max-lg:translate-x-full"
        }`}
      >
        {view && <Content {...view} onClose={onClose} />}
      </section>
    </aside>
  );
}

type ContentProps = View & {
  onClose: () => void;
};

function Content({ module, attempts, onClose }: ContentProps) {
  return (
    <>
      <header className="flex items-start gap-3 border-b border-ui-border-soft bg-ui-surface px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ui-fg">{module.name}</h2>
          <p className="mt-0.5 truncate text-xs text-ui-fg-muted">
            {module.semester} ·{" "}
            <span className="font-mono">{module.module_id}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-ui-fg-muted outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
        >
          <Icon name="close" className="size-4" />
        </button>
      </header>

      <div className="flex items-end gap-4 px-4 pt-4">
        <p className="text-3xl font-semibold text-[var(--accent-fg)] tabular-nums">
          {formatGrade(module.grade)}
        </p>
        <p className="pb-1 text-sm text-ui-fg-muted tabular-nums">
          {formatECTS(module.ects)} ECTS
        </p>
        {module.status !== "passed" && (
          <span className="ml-auto pb-1">
            <Badge tone={statusTone[module.status]}>
              {statusLabel[module.status]}
            </Badge>
          </span>
        )}
      </div>

      {module.not_original && (
        <p className="px-4 pt-2 text-xs text-ui-fg-muted">
          No longer listed in Dualis. Kept from an earlier sync.
        </p>
      )}

      <div className="flex flex-col gap-3 p-4">
        {attempts === null ? (
          <p className="text-sm text-ui-fg-muted">Loading parts…</p>
        ) : attempts.length === 0 ? (
          <p className="text-sm text-ui-fg-muted">No parts recorded.</p>
        ) : (
          attempts.map((attempt) => (
            <AttemptCard
              key={attempt.attempt}
              attempt={attempt}
              single={attempts.length === 1}
            />
          ))
        )}
      </div>
    </>
  );
}

function asStatus(status: string): GradeStatus {
  return status === "passed" || status === "failed" ? status : "pending";
}

function AttemptCard({
  attempt,
  single,
}: {
  attempt: ExamAttempt;
  single: boolean;
}) {
  const status = asStatus(attempt.status);
  const result = parseScore(attempt.grade);
  const showStatus =
    !single &&
    status !== "passed" &&
    result.kind !== "passed" &&
    result.kind !== "failed";

  return (
    <div className="overflow-hidden rounded-lg border border-ui-border-soft">
      <div className="flex items-center gap-2 bg-ui-surface px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-xs text-ui-fg-muted">
          {single
            ? attempt.semester
            : `Attempt ${attempt.attempt} · ${attempt.semester}`}
        </p>
        {showStatus && (
          <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>
        )}
        <ScoreValue
          score={result}
          className="text-sm font-semibold text-ui-fg tabular-nums"
        />
      </div>

      {attempt.components.length > 0 && (
        <ul className="divide-y divide-ui-border-soft">
          {attempt.components.map((component) => (
            <li
              key={component.name}
              className="flex items-center gap-3 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-ui-fg">
                {component.name}
              </span>
              <ScoreValue
                score={parseScore(component.score)}
                className="shrink-0 text-ui-fg-muted tabular-nums"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScoreValue({ score, className }: { score: Score; className: string }) {
  if (score.kind === "passed" || score.kind === "failed") {
    return (
      <Badge tone={statusTone[score.kind]}>{statusLabel[score.kind]}</Badge>
    );
  }

  return (
    <span className={className}>
      {score.kind === "grade" ? score.text : unsetGrade}
    </span>
  );
}
