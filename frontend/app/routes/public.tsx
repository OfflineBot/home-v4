import { useRef, useState } from "react";
import { useRevalidator } from "react-router";
import type { Route } from "./+types/public";
import { Badge, Block, Stack } from "../components/block";
import { Icon } from "../components/icons";
import { PowerSwitch } from "../components/lights/controls";
import { Page } from "../components/page";
import {
  SettingRow,
  buttonClass,
  dangerButtonClass,
  primaryButtonClass,
} from "../components/setting-row";
import { Toast } from "../components/toast";
import { api } from "../lib/api";
import { formatSize } from "../lib/moodle";
import { navColor } from "../lib/nav";
import { requireToken } from "../lib/session";

type PublicFile = {
  id: string;
  name: string;
  size: number;
  content_type: string;
  uploader: string;
  created_at: string;
  downloads: number;
};

type Usage = { files: number; bytes: number; limit: number };

type Settings = { uploads_open: boolean; upload_key: string };

export function meta() {
  return [{ title: "Public" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const headers = { Authorization: `Bearer ${token}` };

  const [listRes, settingsRes] = await Promise.all([
    api("/api/public/files", { headers }),
    api("/api/public/manage/settings", { headers }),
  ]);

  const list = listRes.ok
    ? ((await listRes.json()) as { files: PublicFile[] | null; usage: Usage })
    : { files: [], usage: { files: 0, bytes: 0, limit: 0 } };
  const settings: Settings = settingsRes.ok
    ? await settingsRes.json()
    : { uploads_open: false, upload_key: "" };

  return { files: list.files ?? [], usage: list.usage, settings };
}

async function manage(body: Record<string, unknown>) {
  await fetch("/public/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export default function Public({ loaderData }: Route.ComponentProps) {
  const { files, usage, settings } = loaderData;
  const revalidator = useRevalidator();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const curl = `curl -T file.pdf "${origin}/api/public/upload?key=${settings.upload_key}&name=file.pdf"`;

  function linkOf(file: PublicFile) {
    return `${origin}/api/public/files/${file.id}/${encodeURIComponent(file.name)}`;
  }

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);

    for (const file of Array.from(list)) {
      const query = new URLSearchParams({
        key: settings.upload_key,
        name: file.name,
      });
      const res = await fetch(`/api/public/upload?${query}`, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) {
        setToast(`${file.name} was refused (${res.status}).`);
        break;
      }
    }

    setBusy(false);
    if (input.current) input.current.value = "";
    revalidator.revalidate();
  }

  return (
    <Page
      title="Public"
      icon="public"
      color={navColor("public")}
      actions={
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className={`${primaryButtonClass} inline-flex items-center gap-1.5`}
        >
          <Icon name="upload" className="size-4" />
          Upload
        </button>
      }
    >
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(event) => upload(event.target.files)}
      />

      <Stack>
        <Block
          title="Files"
          status={
            <span className="ml-auto text-xs text-ui-fg-muted tabular-nums">
              {usage.files} · {formatSize(usage.bytes)} of {formatSize(usage.limit)}
            </span>
          }
        >
          {files.length === 0 ? (
            <p className="p-4 text-sm text-ui-fg-muted">
              Nothing here yet. Everything you upload is readable by anyone who
              has the link.
            </p>
          ) : (
            <ul className="divide-y divide-ui-border-soft">
              {files.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <Icon name="file" className="size-4 shrink-0 text-ui-fg-muted" />
                  <span className="min-w-0 flex-1">
                    <a
                      href={linkOf(file)}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-sm text-ui-fg hover:underline"
                    >
                      {file.name}
                    </a>
                    <span className="block truncate text-xs text-ui-fg-muted tabular-nums">
                      {formatSize(file.size)} · {file.downloads} downloads
                      {file.uploader && ` · ${file.uploader}`}
                    </span>
                  </span>
                  <button
                    type="button"
                    title="Copy the link"
                    aria-label="Copy the link"
                    onClick={async () => {
                      await navigator.clipboard.writeText(linkOf(file));
                      setToast("Link copied.");
                    }}
                    className={`${buttonClass} grid size-8 place-items-center px-0`}
                  >
                    <Icon name="copy" className="size-4" />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    aria-label="Delete"
                    onClick={async () => {
                      await manage({ op: "delete", id: file.id });
                      revalidator.revalidate();
                    }}
                    className={`${dangerButtonClass} grid size-8 place-items-center px-0`}
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block title="From a script or an agent">
          <div className="px-4">
            <SettingRow
              label="Uploads without the key"
              hint="On, anyone who can reach the server can put a file here. Off, the key below is needed."
              control={
                <PowerSwitch
                  on={settings.uploads_open}
                  label="Uploads without the key"
                  onChange={async (next) => {
                    await manage({ op: "open", uploads_open: next });
                    revalidator.revalidate();
                  }}
                />
              }
            />
            <SettingRow
              label="The line to paste"
              hint="Downloads never need a key; this one is only for writing."
              control={
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(curl);
                      setToast("Copied.");
                    }}
                    className={`${buttonClass} inline-flex items-center gap-1.5`}
                  >
                    <Icon name="copy" className="size-4" />
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await manage({ op: "key" });
                      revalidator.revalidate();
                      setToast("Every old upload line is dead now.");
                    }}
                    className={dangerButtonClass}
                  >
                    New key
                  </button>
                </>
              }
            >
              <code className="block overflow-x-auto rounded-md border border-ui-border bg-ui-field px-3 py-2 text-xs text-ui-fg-muted">
                {curl}
              </code>
            </SettingRow>
          </div>
        </Block>
      </Stack>

      <Toast message={toast} />
    </Page>
  );
}
