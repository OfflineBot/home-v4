const { call, sourceOptions } = require("../../shared/home");

const keepMs = 3 * 24 * 60 * 60 * 1000;
const firstPollMs = 90 * 1000;

function targets(days, moment, minutes) {
  const offset = minutes * 60 * 1000;
  const list = [];

  for (const day of days) {
    const events = day.events || [];
    if (events.length === 0) continue;

    if (moment === "beforeFirst" && day.first) {
      list.push({ key: `first:${day.date}:${day.first.id}`, at: Date.parse(day.first.start) - offset, event: day.first, day });
    }
    if (moment === "afterLast" && day.last) {
      list.push({ key: `last:${day.date}:${day.last.id}`, at: Date.parse(day.last.end) + offset, event: day.last, day });
    }
    if (moment === "beforeEach") {
      for (const event of events) {
        list.push({ key: `each:${event.id}:${event.start}`, at: Date.parse(event.start) - offset, event, day });
      }
    }
  }

  return list.filter((target) => Number.isFinite(target.at));
}

class HomeV4TimetableTrigger {
  constructor() {
    this.description = {
      displayName: "Home: Timetable Trigger",
      name: "homeV4TimetableTrigger",
      icon: "file:timetable.svg",
      group: ["trigger"],
      version: 1,
      description: "Starts the workflow before or after your events, for example 45 minutes before the first lecture",
      subtitle: '={{$parameter["moment"]}}',
      defaults: { name: "Timetable Trigger" },
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
            { name: "Before the First Event of the Day", value: "beforeFirst" },
            { name: "Before Every Event", value: "beforeEach" },
            { name: "After the Last Event of the Day", value: "afterLast" },
          ],
          default: "beforeFirst",
        },
        {
          displayName: "Minutes",
          name: "minutes",
          type: "number",
          typeOptions: { minValue: 0, maxValue: 720 },
          default: 30,
          description: "How many minutes before the start, or after the end for the last event",
        },
        {
          displayName: "Events",
          name: "source",
          type: "options",
          options: sourceOptions,
          default: "timetable",
        },
        {
          displayName: "Include Cancelled Events",
          name: "includeCancelled",
          type: "boolean",
          default: false,
        },
      ],
    };
  }

  async poll() {
    const moment = this.getNodeParameter("moment");
    const minutes = this.getNodeParameter("minutes");
    const qs = {
      source: this.getNodeParameter("source"),
      cancelled: String(this.getNodeParameter("includeCancelled")),
    };

    const days = await Promise.all(
      ["today", "tomorrow"].map((day) => call(this, "GET", "/api/integration/calendar/day", { qs: { ...qs, day } })),
    );
    const found = targets(days, moment, minutes).sort((a, b) => a.at - b.at);
    const now = Date.now();

    if (this.getMode() === "manual") {
      const next = found.find((target) => target.at >= now) || found[0];
      if (!next) return [[{ json: { found: false, message: "No matching event today or tomorrow" } }]];
      return [[{ json: { found: true, trigger_at: new Date(next.at).toISOString(), date: next.day.date, ...next.event } }]];
    }

    const state = this.getWorkflowStaticData("node");
    const since = typeof state.lastPoll === "number" ? state.lastPoll : now - firstPollMs;
    const fired = state.fired && typeof state.fired === "object" ? state.fired : {};

    for (const [key, at] of Object.entries(fired)) {
      if (now - at > keepMs) delete fired[key];
    }

    const due = found.filter((target) => target.at > since && target.at <= now && !fired[target.key]);
    for (const target of due) fired[target.key] = now;

    state.fired = fired;
    state.lastPoll = now;

    if (due.length === 0) return null;

    return [
      due.map((target) => ({
        json: { found: true, trigger_at: new Date(target.at).toISOString(), date: target.day.date, ...target.event },
      })),
    ];
  }
}

module.exports = { HomeV4TimetableTrigger };
