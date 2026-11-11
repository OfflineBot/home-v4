import { useEffect, useState } from "react";
import { Icon } from "../icons";
import { CodeBlock } from "./code-block";
import { DocxView, Failure, HtmlView, Loading, ModeToggle, PptxView } from "./documents";
import { Markdown } from "./markdown";
import { formatBytes } from "../../lib/format";
import {
  documentLimit,
  kindLabels,
  languageFor,
  previewKind,
  textLimit,
  type PreviewKind,
  type PreviewSource,
} from "../../lib/preview";

type Loaded<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; message: string };

function useRemote<T>(url: string | undefined, read: (res: Response) => Promise<T>, limit: number, size?: number) {
  const [state, setState] = useState<Loaded<T>>({ status: "loading" });

  useEffect(() => {
    if (!url) return;
    if (size !== undefined && size > limit) {
      setState({ status: "error", message: `This file is too large to preview (${formatBytes(size)}).` });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const length = Number(res.headers.get("Content-Length"));
        if (length > limit) throw new Error(`This file is too large to preview (${formatBytes(length)}).`);
        setState({ status: "ready", data: await read(res) });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: error instanceof Error ? error.message : "Failed." });
        }
      });
    return () => controller.abort();
  }, [url, limit, size, read]);

  return state;
}

const readText = (res: Response) => res.text();
const readBuffer = (res: Response) => res.arrayBuffer();
const readBlob = (res: Response) => res.blob();

function TextPreview({ source, kind }: { source: PreviewSource; kind: PreviewKind }) {
  const remote = useRemote(source.text === undefined ? source.url : undefined, readText, textLimit, source.size);
  const text = source.text ?? (remote.status === "ready" ? remote.data : null);
  const [mode, setMode] = useState<"preview" | "source">("preview");

  if (text === null) {
    return remote.status === "error" ? <Failure message={remote.message} /> : <Loading />;
  }
  if (kind === "html") return <HtmlView html={text} name={source.name} />;
  if (kind === "markdown") {
    return (
      <div className="flex flex-col gap-3">
        <ModeToggle value={mode} options={[["preview", "Preview"], ["source", "Source"]]} onChange={setMode} />
        {mode === "preview" ? (
          <div className="rounded-lg border border-ui-border-soft bg-ui-raised p-6">
            <Markdown source={text} />
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-ui-border-soft">
            <CodeBlock code={text} language="markdown" />
          </div>
        )}
      </div>
    );
  }
  if (text.length === 0) return <Failure message="This file is empty." />;
  return (
    <div className="overflow-hidden rounded-lg border border-ui-border-soft">
      <CodeBlock code={text} language={kind === "code" ? languageFor(source.name) : "text"} />
    </div>
  );
}

function DocumentPreview({ source, kind }: { source: PreviewSource; kind: "docx" | "pptx" }) {
  const remote = useRemote(source.url, readBuffer, documentLimit, source.size);
  if (remote.status === "error") return <Failure message={remote.message} />;
  if (remote.status === "loading") return <Loading label={kind === "docx" ? "Opening document…" : "Opening presentation…"} />;
  return kind === "docx" ? <DocxView data={remote.data} name={source.name} /> : <PptxView data={remote.data} />;
}

function PdfPreview({ source }: { source: PreviewSource }) {
  const remote = useRemote(source.url, readBlob, documentLimit * 4, source.size);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (remote.status !== "ready") return;
    const created = URL.createObjectURL(new Blob([remote.data], { type: "application/pdf" }));
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [remote]);

  if (remote.status === "error") return <Failure message={remote.message} />;
  if (!url) return <Loading label="Opening PDF…" />;
  return <iframe title={source.name} src={url} className="h-[75vh] w-full rounded-lg border border-ui-border-soft bg-ui-field" />;
}

function imageSource(source: PreviewSource) {
  if (source.url) return source.url;
  if (source.text !== undefined && /\.svg$/i.test(source.name)) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source.text)}`;
  }
  return null;
}

export function Unsupported({ source }: { source: PreviewSource }) {
  return (
    <div className="grid h-56 place-items-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-ui-field text-ui-fg-muted">
          <Icon name="file" className="size-7" />
        </span>
        <p className="text-sm text-ui-fg-muted">No preview for this file type.</p>
      </div>
    </div>
  );
}

export function FilePreview({ source }: { source: PreviewSource }) {
  const kind = previewKind(source.name, source.mime);

  switch (kind) {
    case "image": {
      const src = imageSource(source);
      return src ? (
        <div className="grid min-h-48 place-items-center overflow-hidden rounded-lg border border-ui-border-soft bg-[repeating-conic-gradient(var(--ui-field)_0_25%,var(--ui-surface)_0_50%)] bg-[length:20px_20px]">
          <img src={src} alt={source.name} className="max-h-[75vh] w-auto max-w-full object-contain" />
        </div>
      ) : (
        <Unsupported source={source} />
      );
    }
    case "video":
      return source.url ? (
        <video src={source.url} controls className="max-h-[75vh] w-full rounded-lg bg-black" />
      ) : (
        <Unsupported source={source} />
      );
    case "audio":
      return source.url ? (
        <div className="grid h-40 place-items-center rounded-lg border border-ui-border-soft bg-ui-field">
          <audio src={source.url} controls className="w-full max-w-md" />
        </div>
      ) : (
        <Unsupported source={source} />
      );
    case "pdf":
      return source.url ? <PdfPreview source={source} /> : <Unsupported source={source} />;
    case "docx":
    case "pptx":
      return source.url ? <DocumentPreview source={source} kind={kind} /> : <Unsupported source={source} />;
    case "markdown":
    case "html":
    case "code":
    case "text":
      return <TextPreview source={source} kind={kind} />;
    default:
      return <Unsupported source={source} />;
  }
}

export function previewLabel(source: PreviewSource) {
  return kindLabels[previewKind(source.name, source.mime)];
}
