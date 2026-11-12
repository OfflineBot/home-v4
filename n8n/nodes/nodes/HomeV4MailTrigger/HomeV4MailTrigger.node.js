const { call } = require("../../shared/home");

const keepIDs = 300;

class HomeV4MailTrigger {
  constructor() {
    this.description = {
      displayName: "Home: Mail Trigger",
      name: "homeV4MailTrigger",
      icon: "file:mail.svg",
      group: ["trigger"],
      version: 1,
      description: "Starts the workflow when a mail arrives",
      subtitle: '={{$parameter["folder"]}}',
      defaults: { name: "Mail Trigger" },
      polling: true,
      inputs: [],
      outputs: ["main"],
      credentials: [{ name: "homeV4Api", required: true }],
      properties: [
        {
          displayName: "Folder",
          name: "folder",
          type: "string",
          default: "inbox",
          description: "The folder to watch, by its name or role",
        },
        {
          displayName: "Only Unread",
          name: "unreadOnly",
          type: "boolean",
          default: true,
        },
        {
          displayName: "From Contains",
          name: "from",
          type: "string",
          default: "",
          placeholder: "dhbw.de",
          description: "Only react to senders matching this. Empty means every sender",
        },
      ],
    };
  }

  async poll() {
    const folder = String(this.getNodeParameter("folder") || "inbox");
    const unreadOnly = this.getNodeParameter("unreadOnly");
    const from = String(this.getNodeParameter("from") || "").trim().toLowerCase();

    const data = await call(this, "GET", "/api/integration/mail/recent", { qs: { folder, limit: 50 } });
    const messages = (data.messages || []).filter((message) => {
      if (unreadOnly && message.is_read) return false;
      if (!from) return true;
      return `${message.sender_name} ${message.sender_email}`.toLowerCase().includes(from);
    });

    const item = (message) => ({
      json: {
        id: message.id,
        subject: message.subject,
        sender_name: message.sender_name,
        sender_email: message.sender_email,
        received: message.received,
        folder: message.folder,
        has_attachments: message.has_attachments,
        is_read: message.is_read,
      },
    });

    if (this.getMode() === "manual") {
      if (messages.length === 0) return [[{ json: { found: false, message: "No mail in that folder" } }]];
      return [[item(messages[0])]];
    }

    const state = this.getWorkflowStaticData("node");
    const seen = Array.isArray(state.seen) ? state.seen : null;
    const ids = messages.map((message) => message.id);

    state.seen = [...ids, ...(seen || [])].slice(0, keepIDs);

    // the first poll only learns what is already there
    if (!seen) return null;

    const due = messages.filter((message) => !seen.includes(message.id));
    if (due.length === 0) return null;

    return [due.map(item)];
  }
}

module.exports = { HomeV4MailTrigger };
