import { useState } from "react";
import { Link, useNavigate, useRevalidator } from "react-router";
import { Icon } from "../icons";
import {
  formatReceived,
  isActiveFolder,
  mailHref,
  mailPageSize,
  orderFolders,
  senderLabel,
  setRead,
  type MailFilter,
  type MailFolder,
  type MailMessage,
} from "../../lib/mail";

const pagerClass =
  "rounded-md px-2 py-1 text-xs text-ui-fg-muted outline-none transition-colors hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none";

const chipClass =
  "h-7 shrink-0 cursor-pointer rounded-md border px-2 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none";

type MessageListProps = {
  folders: MailFolder[];
  folder: string;
  messages: MailMessage[];
  total: number;
  offset: number;
  filter: MailFilter;
  selected: string | null;
  className?: string;
};

export function MessageList({
  folders,
  folder,
  messages,
  total,
  offset,
  filter,
  selected,
  className = "",
}: MessageListProps) {
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [search, setSearch] = useState(filter.q ?? "");
  const active = folders.find((entry) => isActiveFolder(entry, folder));
  const last = Math.min(offset + messages.length, total);

  function go(next: MailFilter) {
    navigate(mailHref({ folder, ...filter, ...next }), {
      preventScrollReset: true,
    });
  }

  async function toggleRead(message: MailMessage) {
    await setRead(message.id, !message.is_read);
    revalidator.revalidate();
  }

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

      <div className="flex shrink-0 items-center gap-2 border-b border-ui-border-soft px-3 py-2">
        <form
          className="min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            go({ q: search.trim() });
          }}
        >
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onBlur={() => search.trim() !== (filter.q ?? "") && go({ q: search.trim() })}
            type="search"
            placeholder="Subject or sender"
            aria-label="Search mail"
            className="h-7 w-full rounded-md border border-ui-border-strong bg-ui-field px-2 text-xs text-ui-fg outline-none focus:border-ctp-mauve"
          />
        </form>
        <button
          type="button"
          aria-pressed={filter.unread ?? false}
          onClick={() => go({ unread: !filter.unread })}
          className={`${chipClass} ${
            filter.unread
              ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-ui-fg"
              : "border-ui-border text-ui-fg-muted hover:bg-ui-hover"
          }`}
        >
          Unread
        </button>
        <button
          type="button"
          aria-pressed={filter.attachments ?? false}
          aria-label="With attachments"
          title="With attachments"
          onClick={() => go({ attachments: !filter.attachments })}
          className={`${chipClass} ${
            filter.attachments
              ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-ui-fg"
              : "border-ui-border text-ui-fg-muted hover:bg-ui-hover"
          }`}
        >
          <Icon name="file" className="size-3.5" />
        </button>
      </div>

      {messages.length === 0 ? (
        <p className="p-4 text-sm text-ui-fg-muted">
          {filter.unread || filter.attachments || filter.q
            ? "No messages match the filter."
            : "No messages."}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-ui-border-soft overflow-y-auto">
          {messages.map((message) => (
            <li key={message.id} className="relative">
              <MessageRow
                message={message}
                href={mailHref({
                  folder,
                  message: message.id,
                  offset,
                  ...filter,
                })}
                active={message.id === selected}
                onToggleRead={() => toggleRead(message)}
              />
            </li>
          ))}
        </ul>
      )}

      {total > mailPageSize && (
        <footer className="flex shrink-0 items-center justify-between border-t border-ui-border-soft px-3 py-1.5">
          {offset > 0 ? (
            <Link
              to={mailHref({
                folder,
                offset: Math.max(0, offset - mailPageSize),
                ...filter,
              })}
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
              to={mailHref({ folder, offset: offset + mailPageSize, ...filter })}
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
  onToggleRead: () => void;
};

function MessageRow({ message, href, active, onToggleRead }: MessageRowProps) {
  const unread = !message.is_read;

  return (
    <>
    <button
      type="button"
      onClick={onToggleRead}
      title={unread ? "Mark as read" : "Mark as unread"}
      aria-label={unread ? "Mark as read" : "Mark as unread"}
      className="absolute top-1/2 right-1.5 z-10 -translate-y-1/2 cursor-pointer rounded-md p-1.5 text-ui-fg-faint outline-none transition-colors hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none"
    >
      <Icon name={unread ? "check" : "mail"} className="size-3.5" />
    </button>
    <Link
      to={href}
      preventScrollReset
      aria-current={active ? "true" : undefined}
      className={`flex flex-col gap-0.5 py-2.5 pr-9 pl-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-ring focus-visible:ring-inset motion-reduce:transition-none ${
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
    </>
  );
}
