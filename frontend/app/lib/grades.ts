export type GradeStatus = "passed" | "failed" | "pending";

export type ExamComponent = {
  name: string;
  score: string;
};

export type ExamAttempt = {
  attempt: number;
  semester: string;
  name: string;
  grade: string;
  status: string;
  components: ExamComponent[];
};

export type Grade = {
  id: number;
  semester_id: string;
  semester: string;
  module_id: string;
  name: string;
  grade: number | null;
  ects: number;
  status: GradeStatus;
  attempts?: ExamAttempt[] | null;
  not_original?: boolean;
  synced_at: string;
};

export type Semester = {
  id: string;
  name: string;
  modules: Grade[];
};

function semesterOrder(name: string, fallback: number) {
  const match = name.match(/(wise|ws|winter\w*|sose|ss|sommer\w*)\s*(\d{4})/i);
  if (!match) return fallback;

  const winter = /^w/i.test(match[1]);
  return Number(match[2]) * 2 + (winter ? 1 : 0);
}

export function currentSemester(semesters: Semester[]) {
  const ranked = semesters.map((semester, index) => ({
    id: semester.id,
    pending: semester.modules.filter((module) => module.status === "pending")
      .length,
    order: semesterOrder(semester.name, index),
  }));
  if (ranked.length === 0) return null;

  const most = Math.max(...ranked.map((entry) => entry.pending));
  const candidates = ranked.filter((entry) => entry.pending === most);
  const pick = most > 0 ? Math.min : Math.max;
  const order = pick(...candidates.map((entry) => entry.order));

  return candidates.find((entry) => entry.order === order)?.id ?? null;
}

export function averageGrade(modules: Grade[]) {
  const graded = modules.filter((module) => module.grade !== null);
  if (graded.length === 0) return null;

  const total = graded.reduce((sum, module) => sum + (module.grade ?? 0), 0);
  return total / graded.length;
}

export function earnedECTS(modules: Grade[]) {
  return modules
    .filter((module) => module.status === "passed")
    .reduce((sum, module) => sum + module.ects, 0);
}

export const unsetGrade = "/";

export function formatGrade(grade: number | null) {
  return grade === null
    ? unsetGrade
    : grade.toLocaleString("de-DE", { minimumFractionDigits: 1 });
}

export function formatAverage(average: number | null) {
  return average === null
    ? unsetGrade
    : average.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

export type Score =
  | { kind: "grade"; text: string }
  | { kind: "passed" | "failed" | "unset" };

export function parseScore(raw: string): Score {
  const value = raw.trim();
  const lower = value.toLowerCase();

  if (value === "" || lower.includes("noch nicht")) return { kind: "unset" };
  if (lower.includes("nicht bestanden") || lower.includes("failed")) {
    return { kind: "failed" };
  }
  if (lower.includes("bestanden") || lower.includes("passed")) {
    return { kind: "passed" };
  }
  return { kind: "grade", text: value };
}

export function formatECTS(ects: number) {
  return ects.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

export const statusLabel: Record<GradeStatus, string> = {
  passed: "Passed",
  failed: "Failed",
  pending: "Pending",
};

export const statusTone = {
  passed: "good",
  failed: "bad",
  pending: "neutral",
} as const satisfies Record<GradeStatus, string>;
