const { call, listLights, listPresets } = require("../../shared/home");

class HomeV4Lights {
  constructor() {
    this.description = {
      displayName: "Home: Lights",
      name: "homeV4Lights",
      icon: "file:lights.svg",
      group: ["output"],
      version: 1,
      subtitle: '={{$parameter["operation"]}}',
      description: "Switch your WLED lights on or off, set brightness or apply a preset",
      defaults: { name: "Lights" },
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
            { name: "Turn On", value: "on", action: "Turn a light on" },
            { name: "Turn Off", value: "off", action: "Turn a light off" },
            { name: "Toggle", value: "toggle", action: "Toggle a light" },
            { name: "Set Brightness", value: "brightness", action: "Set the brightness of a light" },
            { name: "Set Color", value: "color", action: "Set the color of a light" },
            { name: "Apply Preset", value: "preset", action: "Apply a WLED preset" },
            { name: "Get State", value: "state", action: "Get the state of a light" },
          ],
          default: "on",
        },
        {
          displayName: "Light",
          name: "light",
          type: "options",
          typeOptions: { loadOptionsMethod: "getLights" },
          default: "",
          required: true,
          description: "Lights are managed under Settings → Connections",
        },
        {
          displayName: "Brightness (%)",
          name: "brightness",
          type: "number",
          typeOptions: { minValue: 1, maxValue: 100 },
          default: 100,
          displayOptions: { show: { operation: ["on", "brightness", "color"] } },
        },
        {
          displayName: "Color",
          name: "color",
          type: "color",
          default: "#ffb86b",
          displayOptions: { show: { operation: ["color"] } },
        },
        {
          displayName: "Preset",
          name: "preset",
          type: "options",
          typeOptions: { loadOptionsMethod: "getPresets", loadOptionsDependsOn: ["light"] },
          default: "",
          required: true,
          displayOptions: { show: { operation: ["preset"] } },
        },
      ],
    };

    this.methods = { loadOptions: { getLights: listLights, getPresets: listPresets } };
  }

  async execute() {
    const items = this.getInputData();
    const results = [];

    for (let index = 0; index < items.length; index++) {
      const operation = this.getNodeParameter("operation", index);
      const id = encodeURIComponent(this.getNodeParameter("light", index));
      const path = `/api/integration/lights/${id}/state`;

      if (operation === "state") {
        results.push({ json: await call(this, "GET", path), pairedItem: { item: index } });
        continue;
      }

      const body = {};
      if (operation === "on") body.on = true;
      if (operation === "off") body.on = false;
      if (operation === "toggle") body.toggle = true;
      if (operation === "color") {
        body.on = true;
        body.color = String(this.getNodeParameter("color", index)).slice(0, 7);
      }
      if (operation === "on" || operation === "brightness" || operation === "color") {
        body.brightness = this.getNodeParameter("brightness", index);
      }
      if (operation === "preset") body.preset = Number(this.getNodeParameter("preset", index));

      results.push({ json: await call(this, "POST", path, { body }), pairedItem: { item: index } });
    }

    return [results];
  }
}

module.exports = { HomeV4Lights };
