import { calendarTimeZone } from "./calendar";
import { htmlToText } from "./text";

export const mailPageSize = 50;
export const defaultFolder = "inbox";

export type MailFolder = {
  id: string;
  parent_id: string | null;
  name: string;
  role: string;
  total: number;
  unread: number;
};

export type MailMessage = {
  id: string;
  folder: string;
  conversation_id: string;
  subject: string;
  sender_name: string;
  sender_email: string;
  to: string[] | null;
  cc: string[] | null;
  received: string;
  is_read: boolean;
  has_attachments: boolean;
};

export type MailAttachment = {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  content_id: string;
  is_inline: boolean;
  downloaded: boolean;
};

export type MailDetail = MailMessage & {
  body_loaded: boolean;
  body: string;
  body_html: string;
  unsubscribe_url: string;
  attachments: MailAttachment[] | null;
};

export function mailHref(params: {
  folder: string;
  message?: string;
  offset?: number;
}) {
  const search = new URLSearchParams({ folder: params.folder });
  if (params.offset) search.set("offset", String(params.offset));
  if (params.message) search.set("message", params.message);
  return `?${search}`;
}

export function isActiveFolder(folder: MailFolder, ref: string) {
  return folder.id === ref || folder.role === ref;
}

export function orderFolders(folders: MailFolder[]) {
  const ids = new Set(folders.map((folder) => folder.id));
  const children = new Map<string | null, MailFolder[]>();

  for (const folder of folders) {
    const parent =
      folder.parent_id && ids.has(folder.parent_id) ? folder.parent_id : null;
    children.set(parent, [...(children.get(parent) ?? []), folder]);
  }

  const ordered: { folder: MailFolder; depth: number }[] = [];
  function walk(parent: string | null, depth: number) {
    for (const folder of children.get(parent) ?? []) {
      ordered.push({ folder, depth });
      walk(folder.id, depth + 1);
    }
  }
  walk(null, 0);

  return ordered;
}

const shortFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: calendarTimeZone,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const longFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: calendarTimeZone,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatWith(format: Intl.DateTimeFormat, value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : format.format(date);
}

export function formatReceived(value: string) {
  return formatWith(shortFormat, value);
}

export function formatReceivedLong(value: string) {
  return formatWith(longFormat, value);
}

export function senderLabel(message: MailMessage) {
  return message.sender_name || message.sender_email || "Unknown sender";
}

export type Contact = {
  name: string;
  email: string;
  source: "history" | "directory";
};

export const minDirectoryQuery = 3;

export function foldText(value: string) {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

export function addressOf(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

export function contactMatches(contact: Contact, query: string) {
  const needle = foldText(query.trim());
  return foldText(`${contact.name} ${contact.email}`).includes(needle);
}

export function mergeContacts(lists: Contact[][], exclude: string[], limit = 10) {
  const seen = new Set(exclude.map(addressOf));
  const merged: Contact[] = [];

  for (const list of lists) {
    for (const contact of list) {
      const key = contact.email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(contact);
    }
  }

  return merged.slice(0, limit);
}

export type ComposeMode = "new" | "reply" | "reply-all" | "forward";

export type ComposeDraft = {
  mode: ComposeMode;
  to: string;
  cc: string;
  subject: string;
  body: string;
};

export const emptyDraft: ComposeDraft = {
  mode: "new",
  to: "",
  cc: "",
  subject: "",
  body: "",
};

function prefixed(prefix: string, subject: string) {
  return new RegExp(`^${prefix}:`, "i").test(subject)
    ? subject
    : `${prefix}: ${subject}`;
}

function quote(detail: MailDetail) {
  const text = detail.body || htmlToText(detail.body_html);
  const header = `On ${formatReceivedLong(detail.received)}, ${senderLabel(detail)} wrote:`;
  return `\n\n${header}\n${text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")}`;
}

export function composeFrom(detail: MailDetail, mode: ComposeMode): ComposeDraft {
  if (mode === "forward") {
    return {
      mode,
      to: "",
      cc: "",
      subject: prefixed("Fwd", detail.subject),
      body: quote(detail),
    };
  }

  const others = mode === "reply-all" ? (detail.to ?? []) : [];
  return {
    mode,
    to: [detail.sender_email, ...others].filter(Boolean).join(", "),
    cc: mode === "reply-all" ? (detail.cc ?? []).join(", ") : "",
    subject: prefixed("Re", detail.subject),
    body: quote(detail),
  };
}

const frameHead = [
  '<meta charset="utf-8">',
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src data:">`,
  '<base target="_blank">',
  "<style>html{color-scheme:light}body{margin:16px;background:Canvas;color:CanvasText;font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>",
].join("");

export function mailFrame(detail: MailDetail) {
  let html = detail.body_html;

  for (const attachment of detail.attachments ?? []) {
    const cid = attachment.content_id.replace(/^<|>$/g, "");
    if (!cid) continue;
    html = html
      .split(`cid:${cid}`)
      .join(`/mail/media/${encodeURIComponent(attachment.id)}`);
  }

  return `<!doctype html><html><head>${frameHead}</head><body>${html}</body></html>`;
}
