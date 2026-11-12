const { call } = require("../../shared/home");

const screens = [
  { name: "Nothing — Just Open the App", value: "" },
  { name: "Grades", value: "/grades" },
  { name: "Mail", value: "/mail" },
  { name: "Calendar", value: "/calendar" },
  { name: "Moodle", value: "/moodle" },
  { name: "Lights", value: "/lights" },
  { name: "Machine", value: "/machine" },
  { name: "Files", value: "/files" },
];

class HomeV4Notify {
  constructor() {
    this.description = {
      displayName: "Home: Notification",
      name: "homeV4Notify",
      icon: "file:notify.svg",
      group: ["output"],
      version: 1,
      subtitle: '={{$parameter["title"]}}',
      description: "Send a notification to your phone",
      defaults: { name: "Notify" },
      inputs: ["main"],
      outputs: ["main"],
      credentials: [{ name: "homeV4Api", required: true }],
      properties: [
        {
          displayName: "Title",
          name: "title",
          type: "string",
          default: "",
          required: true,
          placeholder: "New grade: {{ $json.name }}",
          description: "The bold first line. Drag a field in or write an expression",
        },
        {
          displayName: "Message",
          name: "message",
          type: "string",
          typeOptions: { rows: 3 },
          default: "",
          placeholder: "{{ $json.grade }} · {{ $json.ects }} ECTS",
          description: "The text under the title, up to 1000 characters",
        },
        {
          displayName: "Tapping It Opens",
          name: "link",
          type: "options",
          options: screens,
          default: "",
        },
      ],
    };
  }

  async execute() {
    const items = this.getInputData();
    const results = [];

    for (let index = 0; index < items.length; index += 1) {
      const body = {
        title: String(this.getNodeParameter("title", index) || ""),
        body: String(this.getNodeParameter("message", index) || ""),
        link: String(this.getNodeParameter("link", index) || ""),
      };

      const sent = await call(this, "POST", "/api/integration/notify", { body });
      results.push({ json: { ...sent, ...body }, pairedItem: { item: index } });
    }

    return [results];
  }
}

module.exports = { HomeV4Notify };
