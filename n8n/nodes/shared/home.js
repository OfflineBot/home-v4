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

async function listMachines() {
  const data = await call(this, "GET", "/api/integration/machines");
  return (data.machines || []).map((machine) => ({
    name: machine.name,
    value: machine.id,
    description: machine.ip,
  }));
}

async function listLights() {
  const data = await call(this, "GET", "/api/integration/lights");
  return (data.lights || []).map((light) => ({
    name: light.name,
    value: light.id,
    description: light.url || light.ip,
  }));
}

async function listPresets() {
  const light = this.getCurrentNodeParameter("light");
  if (!light) return [];

  const data = await call(this, "GET", `/api/integration/lights/${encodeURIComponent(light)}/presets`);
  return (data.presets || []).map((preset) => ({ name: preset.name, value: preset.id }));
}

function dayQuery(context, index) {
  const day = context.getNodeParameter("day", index);
  if (day === "inDays") return `in:${context.getNodeParameter("daysAhead", index)}`;
  if (day === "date") return String(context.getNodeParameter("date", index) || "").slice(0, 10);
  return day;
}

module.exports = { call, sourceOptions, listMachines, listLights, listPresets, dayQuery };
