const credentialName = "homeV4Api";

async function call(context, method, path, options = {}) {
  const credentials = await context.getCredentials(credentialName);
  const base = String(credentials.baseUrl || "").replace(/\/+$/, "");

  return context.helpers.httpRequestWithAuthentication.call(context, credentialName, {
    method,
    url: base + path,
    qs: options.qs,
    body: options.body,
    json: true,
    timeout: options.timeout || 30000,
  });
}

const sourceOptions = [
  { name: "University Timetable", value: "timetable", description: "Lectures and exams from dhbw.app" },
  { name: "Own Events", value: "custom", description: "Events you created in the calendar" },
  { name: "All Events", value: "all" },
];

// A weekly event is a set of plain entries that share title, weekday and
// time, and the series key spells that out. A key without a weekday means
// "every event with this title", whichever day it falls on.
async function listEventSeries() {
  const data = await call(this, "GET", "/api/integration/calendar/series");

  return (data.series || []).map((series) => ({
    name: series.weekday
      ? `${series.title} · ${series.weekday.slice(0, 3)} ${series.start_time}–${series.end_time}`
      : `${series.title} · every weekday it happens`,
    value: series.key,
    description: series.next
      ? `${series.count} in the calendar, next on ${series.next.slice(0, 16).replace("T", " ")}`
      : `${series.count} in the calendar, none coming up`,
  }));
}

function matchesSeries(event, key) {
  const parts = String(key).split("|");
  if (parts.length < 3) return event.title === parts[0];

  return event.title === parts[0] && event.weekday === parts[1] && event.start_time === parts[2];
}

async function listMachines() {
  const data = await call(this, "GET", "/api/integration/machines");
  return (data.machines || []).map((machine) => ({
    name: machine.name,
    value: machine.id,
    description: machine.ip,
  }));
}

const allLights = "all";

async function lightIDs(context) {
  const data = await call(context, "GET", "/api/integration/lights");
  return (data.lights || []).map((light) => light.id);
}

async function listLights() {
  const data = await call(this, "GET", "/api/integration/lights");
  const lights = (data.lights || []).map((light) => ({
    name: light.name,
    value: light.id,
    description: light.url || light.ip,
  }));

  if (lights.length < 2) return lights;

  return [
    { name: "All Lights", value: allLights, description: `Every light at once (${lights.length})` },
    ...lights,
  ];
}

async function listPresets() {
  const light = this.getCurrentNodeParameter("light");
  if (!light || light === allLights) return [];

  const data = await call(this, "GET", `/api/integration/lights/${encodeURIComponent(light)}/presets`);
  return (data.presets || []).map((preset) => ({ name: preset.name, value: preset.id }));
}

function dayQuery(context, index) {
  const day = context.getNodeParameter("day", index);
  if (day === "inDays") return `in:${context.getNodeParameter("daysAhead", index)}`;
  if (day === "date") return String(context.getNodeParameter("date", index) || "").slice(0, 10);
  return day;
}

module.exports = {
  call,
  sourceOptions,
  listEventSeries,
  matchesSeries,
  listMachines,
  listLights,
  listPresets,
  lightIDs,
  allLights,
  dayQuery,
};
