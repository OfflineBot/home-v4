import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRevalidator } from "react-router";
import { Placeholder } from "../block";
import { Icon } from "../icons";
import { adaptFrame } from "./frame";
import { formatSize } from "../../lib/moodle";
import {
  formatReceivedLong,
  mailFrame,
  senderLabel,
  setRead,
  type ComposeMode,
  type MailDetail,
} from "../../lib/mail";

const replyModes: { mode: ComposeMode; label: string }[] = [
  { mode: "reply", label: "Reply" },
  { mode: "reply-all", label: "Reply all" },
  { mode: "forward", label: "Forward" },
];

type ReaderProps = {
  detail: MailDetail | null;
  backHref: string;
  loading: boolean;
  onCompose: (detail: MailDetail, mode: ComposeMode) => void;
  className?: string;
};

export function Reader({
  detail,
  backHref,
  loading,
  onCompose,
  className = "",
}: ReaderProps) {
  return (
    <section
      className={`min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-ui-border bg-ui-raised transition-opacity motion-reduce:transition-none ${
        loading ? "opacity-60" : ""
      } ${className}`}
    >
      {detail ? (
        <Message detail={detail} backHref={backHref} onCompose={onCompose} />
      ) : (
        <div className="p-4">
          <Placeholder
            icon={<Icon name="mail" className="size-5" />}
            hint="Select a message."
          />
        </div>
      )}
    </section>
  );
}

type MessageProps = {
  detail: MailDetail;
  backHref: string;
  onCompose: (detail: MailDetail, mode: ComposeMode) => void;
};

function Message({ detail, backHref, onCompose }: MessageProps) {
  const revalidator = useRevalidator();
  const files = (detail.attachments ?? []).filter(
    (attachment) => !attachment.is_inline,
  );
  const recipients = [...(detail.to ?? []), ...(detail.cc ?? [])];

  return (
    <>
      <header className="flex shrink-0 flex-col gap-1 border-b border-ui-border-soft bg-ui-surface px-4 py-3">
        <div className="flex items-start gap-3">
          <Link
            to={backHref}
            preventScrollReset
            aria-label="Back to messages"
            className="grid size-7 shrink-0 place-items-center rounded-md text-ui-fg-muted outline-none hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring lg:hidden"
          >
            <Icon name="chevron" className="size-4 rotate-180" />
          </Link>
          <h2 className="min-w-0 flex-1 text-base font-semibold text-ui-fg">
            {detail.subject || "(no subject)"}
          </h2>
          <div className="-my-0.5 flex shrink-0 gap-0.5">
            <button
              type="button"
              onClick={async () => {
                await setRead(detail.id, !detail.is_read);
                revalidator.revalidate();
              }}
              aria-label={detail.is_read ? "Mark as unread" : "Mark as read"}
              title={detail.is_read ? "Mark as unread" : "Mark as read"}
              className="grid size-8 cursor-pointer place-items-center rounded-md text-ui-fg-muted outline-none transition-colors hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none"
            >
              <Icon name={detail.is_read ? "mail" : "check"} className="size-4" />
            </button>
            {replyModes.map((entry) => (
              <button
                key={entry.mode}
                type="button"
                onClick={() => onCompose(detail, entry.mode)}
                aria-label={entry.label}
                title={entry.label}
                className="grid size-8 cursor-pointer place-items-center rounded-md text-ui-fg-muted outline-none transition-colors hover:bg-ui-hover hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none"
              >
                <Icon name={entry.mode} className="size-4" />
              </button>
            ))}
          </div>
        </div>
        <p className="truncate text-sm text-ui-fg">
          {senderLabel(detail)}
          {detail.sender_name && detail.sender_email && (
            <span className="text-ui-fg-muted"> · {detail.sender_email}</span>
          )}
        </p>
        <p className="flex flex-wrap gap-x-3 text-xs text-ui-fg-muted tabular-nums">
          <span>{formatReceivedLong(detail.received)}</span>
          {recipients.length > 0 && (
            <span className="min-w-0 truncate">To {recipients.join(", ")}</span>
          )}
          {detail.unsubscribe_url && (
            <a
              href={detail.unsubscribe_url}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:text-ui-fg hover:underline"
            >
              Unsubscribe
            </a>
          )}
        </p>
      </header>

      {files.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-2 border-b border-ui-border-soft px-4 py-2">
          {files.map((file) => (
            <a
              key={file.id}
              href={`/mail/media/${encodeURIComponent(file.id)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-2 rounded-md border border-ui-border px-2.5 py-1 text-xs text-ui-fg outline-none transition-colors hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none"
            >
              <Icon name="files" className="size-3.5 shrink-0 text-ui-fg-muted" />
              <span className="min-w-0 truncate">{file.filename}</span>
              <span className="shrink-0 text-ui-fg-muted tabular-nums">
                {formatSize(file.size)}
              </span>
            </a>
          ))}
        </div>
      )}

      <Body key={detail.id} detail={detail} />
    </>
  );
}

function Body({ detail }: { detail: MailDetail }) {
  if (!detail.body_loaded) {
    return (
      <p className="p-4 text-sm text-ui-fg-muted">
        The content could not be loaded yet.
      </p>
    );
  }

  if (detail.body_html) return <HtmlBody detail={detail} />;

  return (
    <pre className="min-h-0 flex-1 overflow-auto p-4 font-sans text-sm whitespace-pre-wrap text-ui-fg">
      {detail.body}
    </pre>
  );
}

function HtmlBody({ detail }: { detail: MailDetail }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  const apply = useCallback(() => {
    if (!frame.current) return;
    adaptFrame(frame.current);
    setReady(true);
  }, []);

  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (doc?.readyState === "complete" && doc.body?.childNodes.length) apply();
  }, [apply]);

  return (
    <iframe
      ref={frame}
      title={detail.subject || "Message"}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={mailFrame(detail)}
      onLoad={apply}
      className={`min-h-0 w-full flex-1 border-0 bg-transparent transition-opacity duration-200 motion-reduce:transition-none ${
        ready ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}
