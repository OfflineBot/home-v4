const { call, listMachines } = require("../../shared/home");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checkEveryMs = 5000;

class HomeV4Machine {
  constructor() {
    this.description = {
      displayName: "Home: Machine",
      name: "homeV4Machine",
      icon: "file:machine.svg",
      group: ["output"],
      version: 1,
      subtitle: '={{$parameter["operation"]}}',
      description: "Wake up a PC with Wake on LAN or check if it is online",
      defaults: { name: "Machine" },
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
            { name: "Wake Up", value: "wake", action: "Wake up a machine" },
            { name: "Check Status", value: "status", action: "Check if a machine is online" },
            { name: "List Machines", value: "list", action: "List your machines" },
          ],
          default: "wake",
        },
        {
          displayName: "Machine",
          name: "machine",
          type: "options",
          typeOptions: { loadOptionsMethod: "getMachines" },
          default: "",
          required: true,
          displayOptions: { show: { operation: ["wake", "status"] } },
          description: "Machines are managed under Settings → Connections",
        },
        {
          displayName: "Wait Until Online",
          name: "waitOnline",
          type: "boolean",
          default: false,
          displayOptions: { show: { operation: ["wake"] } },
        },
        {
          displayName: "Timeout (Seconds)",
          name: "timeout",
          type: "number",
          typeOptions: { minValue: 10, maxValue: 600 },
          default: 120,
          displayOptions: { show: { operation: ["wake"], waitOnline: [true] } },
        },
      ],
    };

    this.methods = { loadOptions: { getMachines: listMachines } };
  }

  async execute() {
    const items = this.getInputData();
    const results = [];

    for (let index = 0; index < items.length; index++) {
      const operation = this.getNodeParameter("operation", index);

      if (operation === "list") {
        const data = await call(this, "GET", "/api/integration/machines");
        for (const machine of data.machines || []) results.push({ json: machine, pairedItem: { item: index } });
        continue;
      }

      const id = encodeURIComponent(this.getNodeParameter("machine", index));

      if (operation === "status") {
        const status = await call(this, "GET", `/api/integration/machines/${id}/status`);
        results.push({ json: status, pairedItem: { item: index } });
        continue;
      }

      await call(this, "POST", `/api/integration/machines/${id}/wake`, { body: {} });
      const started = Date.now();
      let status = { online: null };

      if (this.getNodeParameter("waitOnline", index)) {
        const limit = this.getNodeParameter("timeout", index) * 1000;
        while (Date.now() - started < limit) {
          status = await call(this, "GET", `/api/integration/machines/${id}/status`);
          if (status.online) break;
          await sleep(checkEveryMs);
        }
      }

      results.push({
        json: {
          ...status,
          woken: true,
          waited_seconds: Math.round((Date.now() - started) / 1000),
        },
        pairedItem: { item: index },
      });
    }

    return [results];
  }
}

module.exports = { HomeV4Machine };
