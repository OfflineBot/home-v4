const { call } = require("../../shared/home");

function keyOf(grade) {
  return `${grade.semester_id}:${grade.module_id}:${grade.name}`;
}

function changed(grade, before, moment) {
  const now = grade.grade;

  if (moment === "graded") {
    return now !== null && now !== undefined && (before === undefined || before === null);
  }
  if (moment === "changed") {
    return before !== undefined && String(before) !== String(now);
  }

  return before === undefined;
}

class HomeV4GradeTrigger {
  constructor() {
    this.description = {
      displayName: "Home: Grade Trigger",
      name: "homeV4GradeTrigger",
      icon: "file:grade.svg",
      group: ["trigger"],
      version: 1,
      description: "Starts the workflow when Dualis has a new grade",
      subtitle: '={{$parameter["moment"]}}',
      defaults: { name: "Grade Trigger" },
      polling: true,
      inputs: [],
      outputs: ["main"],
      credentials: [{ name: "homeV4Api", required: true }],
      properties: [
        {
          displayName: "When",
          name: "moment",
          type: "options",
          options: [
            { name: "A Module Is Graded", value: "graded", description: "A module that had no grade has one now" },
            { name: "A Grade Changes", value: "changed", description: "A grade that was already there is different" },
            { name: "A Module Appears", value: "added", description: "Any new module, graded or not" },
          ],
          default: "graded",
        },
        {
          displayName: "Semester",
          name: "semester",
          type: "string",
          default: "",
          placeholder: "WiSe 2025/26",
          description: "Only react to this semester. Empty means every semester",
        },
      ],
    };
  }

  async poll() {
    const moment = this.getNodeParameter("moment");
    const semester = String(this.getNodeParameter("semester") || "").trim().toLowerCase();

    const data = await call(this, "GET", "/api/integration/grades");
    const all = data.grades || [];
    const grades = semester
      ? all.filter((grade) => String(grade.semester || "").toLowerCase().includes(semester))
      : all;

    const item = (grade, before) => ({
      json: {
        module_id: grade.module_id,
        name: grade.name,
        grade: grade.grade,
        previous: before === undefined ? null : before,
        ects: grade.ects,
        status: grade.status,
        semester: grade.semester,
        semester_id: grade.semester_id,
        not_original: grade.not_original,
      },
    });

    if (this.getMode() === "manual") {
      const sample = grades.filter((grade) => grade.grade !== null && grade.grade !== undefined).pop() || grades[0];
      if (!sample) return [[{ json: { found: false, message: "No grades yet" } }]];
      return [[item(sample, null)]];
    }

    const state = this.getWorkflowStaticData("node");
    const known = state.grades && typeof state.grades === "object" ? state.grades : null;
    const next = {};
    for (const grade of grades) next[keyOf(grade)] = grade.grade ?? null;

    state.grades = next;

    // the first poll only learns what is already there
    if (!known) return null;

    const due = grades.filter((grade) => changed(grade, known[keyOf(grade)], moment));
    if (due.length === 0) return null;

    return [due.map((grade) => item(grade, known[keyOf(grade)]))];
  }
}

module.exports = { HomeV4GradeTrigger };
