import { useState } from "react";
import { useNavigation } from "react-router";
import type { Route } from "./+types/mail";
import { EmptySync } from "../components/empty-sync";
import { Icon } from "../components/icons";
import { ComposePane } from "../components/mail/compose";
import { ExportDialog } from "../components/mail/export-dialog";
import { FolderList } from "../components/mail/folder-list";
import { MessageList } from "../components/mail/message-list";
import { Reader } from "../components/mail/reader";
import { Page } from "../components/page";
import { buttonClass, primaryButtonClass } from "../components/setting-row";
import { SyncButton } from "../components/sync-button";
import { api } from "../lib/api";
import { isConnected } from "../lib/connections.server";
import {
  composeFrom,
  defaultFolder,
  emptyDraft,
  mailHref,
  mailPageSize,
  type ComposeDraft,
  type MailDetail,
  type MailFolder,
  type MailMessage,
} from "../lib/mail";
import { navColor } from "../lib/nav";
import { requireToken } from "../lib/session";
import { syncState } from "../lib/sync.server";

const detailTimeoutMs = 60_000;

export function meta() {
  return [{ title: "Mail" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const headers = { Authorization: `Bearer ${token}` };
  const url = new URL(request.url);
  const folder = url.searchParams.get("folder") || defaultFolder;
  const messageId = url.searchParams.get("message");
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const query = new URLSearchParams({
    folder,
    limit: String(mailPageSize),
    offset: String(offset),
  });

  const [foldersRes, listRes, detailRes, sync, connected] = await Promise.all([
    api("/api/mail/folders", { headers }),
    api(`/api/mail/messages?${query}`, { headers }),
    messageId
      ? api(`/api/mail/messages/${encodeURIComponent(messageId)}`, {
          headers,
          signal: AbortSignal.timeout(detailTimeoutMs),
        })
      : null,
    syncState(token, "mail"),
    isConnected(token, "mail"),
  ]);

  const folders: MailFolder[] = foldersRes.ok
    ? ((await foldersRes.json()).folders ?? [])
    : [];
  const list = listRes.ok
    ? ((await listRes.json()) as { messages: MailMessage[] | null; total: number })
    : { messages: [], total: 0 };
  const detail: MailDetail | null = detailRes?.ok
    ? await detailRes.json()
    : null;

  return {
    folders,
    folder,
    offset,
    messages: list.messages ?? [],
    total: list.total ?? 0,
    detail,
    sync,
    connected,
  };
}

export default function Mail({ loaderData }: Route.ComponentProps) {
  const { folders, folder, offset, messages, total, detail, sync, connected } =
    loaderData;
  const navigation = useNavigation();
  const [draft, setDraft] = useState<ComposeDraft | null>(null);
  const [exporting, setExporting] = useState(false);
  const loading =
    navigation.state === "loading" && navigation.location.pathname === "/mail";
  const selected = detail?.id ?? null;
  const side = draft !== null || selected !== null;

  return (
    <Page
      title="Mail"
      icon="mail"
      color={navColor("mail")}
      actions={
        <>
          <SyncButton job="mail" state={sync} />
          {folders.length > 0 && (
            <button
              type="button"
              onClick={() => setExporting(true)}
              title="Export mails"
              className={`${buttonClass} inline-flex items-center gap-1.5`}
            >
              <Icon name="download" className="size-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
          )}
          {connected && (
            <button
              type="button"
              onClick={() => setDraft(emptyDraft)}
              className={`${primaryButtonClass} inline-flex items-center gap-1.5`}
            >
              <Icon name="plus" className="size-4" />
              New mail
            </button>
          )}
        </>
      }
    >
      {folders.length === 0 ? (
        <EmptySync connected={connected} />
      ) : (
        <div className="flex h-full min-h-[32rem] gap-3">
          <FolderList
            folders={folders}
            current={folder}
            className="hidden w-48 shrink-0 lg:flex"
          />
          <MessageList
            folders={folders}
            folder={folder}
            messages={messages}
            total={total}
            offset={offset}
            selected={selected}
            className={`min-w-0 flex-1 lg:w-80 lg:flex-none 2xl:w-96 ${
              side ? "hidden lg:flex" : "flex"
            }`}
          />
          {draft ? (
            <ComposePane
              key={`${draft.mode}:${draft.subject}`}
              draft={draft}
              onClose={() => setDraft(null)}
              className="flex"
            />
          ) : (
            <Reader
              detail={detail}
              backHref={mailHref({ folder, offset })}
              loading={loading}
              onCompose={(message, mode) => setDraft(composeFrom(message, mode))}
              className={selected ? "flex" : "hidden lg:flex"}
            />
          )}
        </div>
      )}
      <ExportDialog open={exporting} folders={folders} onClose={() => setExporting(false)} />
    </Page>
  );
}
