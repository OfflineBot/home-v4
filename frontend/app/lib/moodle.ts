import { htmlToText } from "./text";

export const moodleBase = "https://elearning.dhbw-ravensburg.de";

export type MoodleCourse = {
  id: number;
  shortname: string;
  fullname: string;
  summary: string;
  category: string;
  semester: string;
  semester_number: number;
  is_current: boolean;
  is_favourite: boolean;
  has_image: boolean;
  placement?: { semester: number; position: number; custom: boolean };
  synced_at: string;
};

export type MoodleFile = {
  id: string;
  filename: string;
  filepath: string;
  type: string;
  link?: string;
  mimetype: string;
  filesize: number;
  time_modified: number;
  downloaded: boolean;
  embedded: boolean;
};

export type MoodleModule = {
  id: number;
  name: string;
  modname: string;
  url: string;
  indent: number;
  description: string;
  availability: string;
  has_content: boolean;
  files: MoodleFile[] | null;
};

export type MoodleSection = {
  id: number;
  number: number;
  name: string;
  summary: string;
  modules: MoodleModule[] | null;
};

export type MoodleGrade = {
  id: number;
  name: string;
  item_type: string;
  formatted: string;
  passed: boolean | null;
  feedback: string;
};

export type MoodleSemester = {
  semester: number;
  courses: MoodleCourse[];
};

export type MoodleCourseDetail = {
  course: MoodleCourse;
  sections: MoodleSection[] | null;
  grades: MoodleGrade[] | null;
};

export type MediaKind = "file" | "asset" | "image";

export function mediaHref(kind: MediaKind, id: string | number) {
  return `/moodle/media/${kind}/${encodeURIComponent(String(id))}`;
}

export function courseHref(id: number) {
  return `${moodleBase}/course/view.php?id=${id}`;
}

export { htmlToText };

const coursePrefix = /^\s*(?:[A-Z]{2,4}-)?[A-Z]{2,5}\s?\d{2,4}[A-Z]?\s*[-–—:]\s*/;
const lecturerTag = /\(\s*[A-ZÄÖÜ][A-Za-zÄÖÜäöü]{1,4}\s*\)/g;
const nameCollator = new Intl.Collator("de", { sensitivity: "base", numeric: true });

export function courseName(name: string) {
  const text = htmlToText(name);
  return text.replace(coursePrefix, "").trim() || text;
}

export function compareCourses(a: { fullname: string }, b: { fullname: string }) {
  return nameCollator.compare(courseName(a.fullname), courseName(b.fullname));
}

function courseWords(name: string) {
  return words(courseName(name).replace(lecturerTag, " "));
}

function cleanTitle(title: string) {
  return htmlToText(title)
    .replace(/<[^>]*>/g, " ")
    .replace(/\([^)]*\d[^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const units = ["B", "KB", "MB", "GB"];

export function formatSize(bytes: number) {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toLocaleString("de-DE", { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`;
}

type Kind = { label: string; icon: string; color: string };

const moduleKinds: Record<string, Kind> = {
  resource: { label: "File", icon: "files", color: "blue" },
  folder: { label: "Folder", icon: "files", color: "peach" },
  url: { label: "Link", icon: "pages", color: "sky" },
  page: { label: "Page", icon: "pages", color: "lavender" },
  book: { label: "Book", icon: "pages", color: "lavender" },
  assign: { label: "Assignment", icon: "grades", color: "yellow" },
  quiz: { label: "Quiz", icon: "grades", color: "mauve" },
  forum: { label: "Forum", icon: "mail", color: "teal" },
  attendance: { label: "Attendance", icon: "calendar", color: "green" },
  label: { label: "Note", icon: "pages", color: "overlay2" },
};

export function moduleKind(modname: string): Kind {
  return moduleKinds[modname] ?? { label: modname, icon: "pages", color: "overlay2" };
}

const fileColors: [RegExp, string][] = [
  [/pdf/, "red"],
  [/word|wordprocessing|opendocument\.text|rtf|\.docx?$|\.odt$/, "blue"],
  [/presentation|powerpoint|\.pptx?$|\.odp$|\.key$/, "peach"],
  [/sheet|excel|csv|\.xlsx?$|\.ods$/, "green"],
  [/zip|rar|7z|tar|gzip|compressed|\.zip$|\.rar$|\.7z$/, "yellow"],
  [/^image\//, "pink"],
  [/^video\//, "mauve"],
  [/^audio\//, "flamingo"],
  [/^text\/|json|xml|javascript|python|java|\.ipynb$|\.sql$|\.py$|\.c$/, "teal"],
];

export function fileKind(file: MoodleFile) {
  if (file.link) return { label: "LINK", color: "sky" };

  const extension = file.filename.includes(".")
    ? (file.filename.split(".").pop() ?? "").toLowerCase()
    : "";
  const probe = `${file.mimetype} .${extension}`;
  const color = fileColors.find(([pattern]) => pattern.test(probe))?.[1];

  return {
    label: extension.slice(0, 4).toUpperCase() || "FILE",
    color: color ?? "overlay2",
  };
}

export type CourseRef = {
  id: number;
  fullname: string;
  semester: number;
};

const umlauts: [RegExp, string][] = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/ß/g, "ss"],
];

const stopwords = new Set([
  "und",
  "der",
  "die",
  "das",
  "fuer",
  "von",
  "mit",
  "im",
  "in",
  "zu",
  "and",
  "the",
  "of",
  "a",
  "an",
  "vorlesung",
  "vl",
  "uebung",
  "tutorium",
  "klausur",
  "pruefung",
  "gruppe",
]);

const codePattern = /^(?=.*\d)(?=.*[a-z])/;

function words(value: string) {
  let text = value.toLowerCase();
  for (const [pattern, replacement] of umlauts) text = text.replace(pattern, replacement);
  return text
    .split(/[^a-z0-9-]+/)
    .filter((token) => !token.split("-").some((part) => codePattern.test(part)))
    .flatMap((token) => token.split("-"))
    .filter((word) => word.length > 0 && !stopwords.has(word))
    .map((word) => (word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word));
}

function overlap(wanted: string[], have: string[]) {
  if (wanted.length === 0) return 0;
  if (` ${have.join(" ")} `.includes(` ${wanted.join(" ")} `)) return 1;
  return wanted.filter((word) => have.includes(word)).length / wanted.length;
}

const minScore = 0.6;

type Candidate = {
  course: CourseRef;
  score: number;
  both: number;
  length: number;
};

function better(next: Candidate, best: Candidate | null) {
  if (!best) return true;
  if (next.score !== best.score) return next.score > best.score;
  if (next.both !== best.both) return next.both > best.both;
  if (next.course.semester !== best.course.semester) {
    return next.course.semester > best.course.semester;
  }
  return next.length < best.length;
}

function same(a: Candidate, b: Candidate) {
  return (
    a.score === b.score &&
    a.both === b.both &&
    a.course.semester === b.course.semester &&
    a.length === b.length
  );
}

export function matchCourse(title: string, courses: CourseRef[]) {
  const clean = cleanTitle(title);
  const parts = clean.split("/").map((part) => part.trim()).filter(Boolean);
  const attempts = [parts.join(" ")];
  const last = parts[parts.length - 1];
  if (parts.length > 1 && words(last).length >= 2) attempts.push(last);

  for (const attempt of attempts) {
    const found = bestCourse(attempt, courses);
    if (found) return found;
  }

  return null;
}

function bestCourse(title: string, courses: CourseRef[]) {
  const wanted = words(title);
  if (wanted.length === 0) return null;

  let best: Candidate | null = null;
  let tied = false;
  for (const course of courses) {
    const have = courseWords(course.fullname);
    const forward = overlap(wanted, have);
    const reverse = overlap(have, wanted);
    const candidate = {
      course,
      score: Math.max(forward, reverse),
      both: forward + reverse,
      length: have.length,
    };

    if (candidate.score < minScore) continue;
    if (best && same(candidate, best)) {
      tied = true;
    } else if (better(candidate, best)) {
      best = candidate;
      tied = false;
    }
  }

  return tied ? null : (best?.course ?? null);
}

export function semesterLabel(semester: number) {
  return semester > 0 ? `Semester ${semester}` : "General";
}

function semesterOrder(a: number, b: number) {
  return (b || -1) - (a || -1);
}

export function arrangeSemesters(semesters: MoodleSemester[], titles: string[]) {
  const refs = semesters.flatMap((entry) =>
    entry.courses.map((course) => ({
      id: course.id,
      fullname: course.fullname,
      semester: entry.semester,
    })),
  );

  const active = new Set<number>();
  for (const title of new Set(titles)) {
    const match = matchCourse(title, refs);
    if (match) active.add(match.id);
  }

  const counts = new Map<number, number>();
  for (const ref of refs) {
    if (active.has(ref.id) && ref.semester > 0) {
      counts.set(ref.semester, (counts.get(ref.semester) ?? 0) + 1);
    }
  }
  const latest = Math.max(0, ...refs.map((ref) => ref.semester));
  const current =
    [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? latest;

  const placed = new Map<number, MoodleCourse[]>();
  for (const entry of semesters) {
    for (const course of entry.courses) {
      const moved =
        current > 0 && active.has(course.id) && !course.placement?.custom;
      const semester = moved ? current : entry.semester;
      placed.set(semester, [...(placed.get(semester) ?? []), course]);
    }
  }

  return {
    current,
    semesters: [...placed]
      .map(([semester, courses]) => ({ semester, courses: [...courses].sort(compareCourses) }))
      .sort((a, b) => semesterOrder(a.semester, b.semester)),
  };
}
