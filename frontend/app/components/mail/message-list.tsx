import { Link, useNavigate } from "react-router";
import { Icon } from "../icons";
import {
  formatReceived,
  isActiveFolder,
  mailHref,
  mailPageSize,
  orderFolders,
  senderLabel,
  type MailFolder,
  type MailMessage,
} from "../../lib/mail";

const pagerClass =
  "rounded-md px-2 py-1 text-xs text-ui-fg-muted outline-none transition-colors hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none";

type MessageListProps = {
  folders: MailFolder[];
  folder: string;
  messages: MailMessage[];
  total: number;
  offset: number;
  selected: string | null;
  className?: string;
};

export function MessageList({
  folders,
  folder,
  messages,
  total,
  offset,
  selected,
  className = "",
}: MessageListProps) {
  const navigate = useNavigate();
  const active = folders.find((entry) => isActiveFolder(entry, folder));
  const last = Math.min(offset + messages.length, total);

  return (
    <section
      className={`min-h-0 flex-col overflow-hidden rounded-xl border border-ui-border bg-ui-raised ${className}`}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-ui-border-soft bg-ui-surface px-3">
        <h2 className="hidden min-w-0 flex-1 truncate text-sm font-semibold text-ui-fg lg:block">
          {active?.name ?? "Inbox"}
        </h2>
        <select
          aria-label="Folder"
          value={active?.id ?? folder}
          onChange={(event) =>
            navigate(mailHref({ folder: event.target.value }))
          }
          className="h-8 min-w-0 flex-1 rounded-md border border-ui-border-strong bg-ui-field px-2 text-sm text-ui-fg outline-none lg:hidden"
        >
          {orderFolders(folders).map(({ folder: entry, depth }) => (
            <option key={entry.id} value={entry.id}>
              {"  ".repeat(depth)}
              {entry.name}
            </option>
          ))}
        </select>
        <span className="shrink-0 text-xs text-ui-fg-muted tabular-nums">
          {total > 0 ? `${offset + 1}–${last} of ${total}` : "0"}
        </span>
      </header>

      {messages.length === 0 ? (
        <p className="p-4 text-sm text-ui-fg-muted">No messages.</p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-ui-border-soft overflow-y-auto">
          {messages.map((message) => (
            <li key={message.id}>
              <MessageRow
                message={message}
                href={mailHref({ folder, message: message.id, offset })}
                active={message.id === selected}
              />
            </li>
          ))}
        </ul>
      )}

      {total > mailPageSize && (
        <footer className="flex shrink-0 items-center justify-between border-t border-ui-border-soft px-3 py-1.5">
          {offset > 0 ? (
            <Link
              to={mailHref({ folder, offset: Math.max(0, offset - mailPageSize) })}
              preventScrollReset
              className={pagerClass}
            >
              Newer
            </Link>
          ) : (
            <span />
          )}
          {last < total && (
            <Link
              to={mailHref({ folder, offset: offset + mailPageSize })}
              preventScrollReset
              className={pagerClass}
            >
              Older
            </Link>
          )}
        </footer>
      )}
    </section>
  );
}

type MessageRowProps = {
  message: MailMessage;
  href: string;
  active: boolean;
};

function MessageRow({ message, href, active }: MessageRowProps) {
  const unread = !message.is_read;

  return (
    <Link
      to={href}
      preventScrollReset
      aria-current={active ? "true" : undefined}
      className={`flex flex-col gap-0.5 px-3 py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-ring focus-visible:ring-inset motion-reduce:transition-none ${
        active
          ? "bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]"
          : "hover:bg-ui-hover"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {unread && (
          <span className="size-2 shrink-0 rounded-full bg-[var(--accent)]" />
        )}
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            unread ? "font-semibold text-ui-fg" : "text-ui-fg"
          }`}
        >
          {senderLabel(message)}
        </span>
        {message.has_attachments && (
          <Icon name="files" className="size-3.5 shrink-0 text-ui-fg-muted" />
        )}
        <span className="shrink-0 text-xs text-ui-fg-muted tabular-nums">
          {formatReceived(message.received)}
        </span>
      </span>
      <span
        className={`truncate text-sm ${
          unread ? "text-ui-fg" : "text-ui-fg-muted"
        }`}
      >
        {message.subject || "(no subject)"}
      </span>
    </Link>
  );
}
