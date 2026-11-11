const { call, sourceOptions, dayQuery } = require("../../shared/home");

const dayOptions = [
  { name: "Today", value: "today" },
  { name: "Tomorrow", value: "tomorrow" },
  { name: "Next Day With Events", value: "next", description: "The next day after today that has events" },
  { name: "In X Days", value: "inDays" },
  { name: "Specific Date", value: "date" },
  { name: "This Week", value: "week" },
  { name: "Next Week", value: "nextWeek" },
];

class HomeV4Timetable {
  constructor() {
    this.description = {
      displayName: "Home: Timetable",
      name: "homeV4Timetable",
      icon: "file:timetable.svg",
      group: ["input"],
      version: 1,
      subtitle: '={{$parameter["operation"]}}',
      description: "Read your university timetable and own calendar events",
      defaults: { name: "Timetable" },
      inputs: ["main"],
      outputs: ["main"],
      credentials: [{ name: "homeV4Api", required: true }],
      properties: [
        {
          displayName: "Operation",
          name: "operation",
          type: "options",
          noDataExpression: true,
          options: [
            { name: "Get First Event of a Day", value: "first", action: "Get the first event of a day" },
            { name: "Get Last Event of a Day", value: "last", action: "Get the last event of a day" },
            { name: "Get Next Upcoming Event", value: "upcoming", action: "Get the next event that has not started yet" },
            { name: "Get Events", value: "events", action: "Get all events of a day or week" },
          ],
          default: "first",
        },
        {
          displayName: "Day",
          name: "day",
          type: "options",
          options: dayOptions,
          default: "today",
          displayOptions: { hide: { operation: ["upcoming"] } },
        },
        {
          displayName: "Days Ahead",
          name: "daysAhead",
          type: "number",
          typeOptions: { minValue: 0, maxValue: 365 },
          default: 2,
          displayOptions: { show: { day: ["inDays"] }, hide: { operation: ["upcoming"] } },
        },
        {
          displayName: "Date",
          name: "date",
          type: "dateTime",
          default: "",
          displayOptions: { show: { day: ["date"] }, hide: { operation: ["upcoming"] } },
        },
        {
          displayName: "Events",
          name: "source",
          type: "options",
          options: sourceOptions,
          default: "timetable",
        },
        {
          displayName: "Output",
          name: "output",
          type: "options",
          options: [
            { name: "One Item With All Events", value: "list", description: "Also returns an item when there are no events" },
            { name: "One Item per Event", value: "split" },
          ],
          default: "list",
          displayOptions: { show: { operation: ["events"] } },
        },
        {
          displayName: "Include Cancelled Events",
          name: "includeCancelled",
          type: "boolean",
          default: false,
        },
        {
          displayName: "Include Hidden Events",
          name: "includeHidden",
          type: "boolean",
          default: false,
        },
        {
          displayName: "Only Important Events",
          name: "onlyImportant",
          type: "boolean",
          default: false,
          description: "Whether to only return events marked as important, for example exams",
        },
      ],
    };
  }

  async execute() {
    const items = this.getInputData();
    const results = [];

    for (let index = 0; index < items.length; index++) {
      const operation = this.getNodeParameter("operation", index);
      const qs = {
        source: this.getNodeParameter("source", index),
        cancelled: String(this.getNodeParameter("includeCancelled", index)),
        hidden: String(this.getNodeParameter("includeHidden", index)),
        important: String(this.getNodeParameter("onlyImportant", index)),
      };

      if (operation === "upcoming") {
        const data = await call(this, "GET", "/api/integration/calendar/upcoming", { qs });
        results.push({ json: { found: Boolean(data.event), ...(data.event || {}) }, pairedItem: { item: index } });
        continue;
      }

      qs.day = dayQuery(this, index);
      const data = await call(this, "GET", "/api/integration/calendar/day", { qs });

      if (operation === "first" || operation === "last") {
        const event = operation === "first" ? data.first : data.last;
        results.push({
          json: { found: Boolean(event), date: data.date, day: data.label, ...(event || {}) },
          pairedItem: { item: index },
        });
        continue;
      }

      if (this.getNodeParameter("output", index) === "split") {
        for (const event of data.events || []) {
          results.push({ json: event, pairedItem: { item: index } });
        }
        continue;
      }

      results.push({
        json: {
          date: data.date,
          day: data.label,
          from: data.from,
          to: data.to,
          count: (data.events || []).length,
          first: data.first,
          last: data.last,
          events: data.events || [],
        },
        pairedItem: { item: index },
      });
    }

    return [results];
  }
}

module.exports = { HomeV4Timetable };
