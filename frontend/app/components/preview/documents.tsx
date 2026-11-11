import { useEffect, useState } from "react";
import { CodeBlock } from "./code-block";

function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const value = (name: string) => css.getPropertyValue(`--ctp-${name}`).trim();
  return {
    background: value("base"),
    text: value("text"),
    muted: value("subtext0"),
    border: value("surface1"),
    accent: value("blue"),
    code: value("mantle"),
  };
}

function documentShell(body: string) {
  const colors = themeColors();
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:">
<style>
html{background:${colors.background};color:${colors.text}}
body{margin:0;padding:32px 40px;font:15px/1.65 Inter,ui-sans-serif,system-ui,sans-serif;max-width:860px}
h1,h2,h3,h4{line-height:1.3;margin:1.4em 0 .5em}
h1{font-size:1.8em}h2{font-size:1.45em}h3{font-size:1.2em}
p{margin:.6em 0}a{color:${colors.accent}}
img{max-width:100%;height:auto;border-radius:6px}
table{border-collapse:collapse;margin:1em 0;width:100%}
td,th{border:1px solid ${colors.border};padding:6px 10px;vertical-align:top}
blockquote{border-left:3px solid ${colors.border};margin:1em 0;padding-left:1em;color:${colors.muted}}
code,pre{background:${colors.code};border-radius:4px;font-family:ui-monospace,monospace}
pre{padding:12px;overflow:auto}
</style></head><body>${body}</body></html>`;
}

export function SandboxFrame({ html, title, className = "h-[70vh]" }: { html: string; title: string; className?: string }) {
  return (
    <iframe
      title={title}
      sandbox=""
      srcDoc={html}
      referrerPolicy="no-referrer"
      className={`w-full rounded-lg border border-ui-border-soft bg-ctp-base ${className}`}
    />
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="grid h-64 place-items-center">
      <span className="flex items-center gap-2 text-sm text-ui-fg-muted">
        <span className="size-2 animate-pulse rounded-full bg-[var(--accent)] motion-reduce:animate-none" />
        {label}
      </span>
    </div>
  );
}

export function Failure({ message }: { message: string }) {
  return (
    <div className="grid h-48 place-items-center">
      <p className="text-sm text-ui-danger">{message}</p>
    </div>
  );
}

export function DocxView({ data, name }: { data: ArrayBuffer; name: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("mammoth")
      .then((module) => {
        const mammoth = module.default ?? (module as unknown as typeof module.default);
        return mammoth.convertToHtml({ arrayBuffer: data });
      })
      .then((result) => !cancelled && setHtml(documentShell(result.value)))
      .catch(() => !cancelled && setError("This document could not be opened."));
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (error) return <Failure message={error} />;
  if (html === null) return <Loading label="Opening document…" />;
  return <SandboxFrame html={html} title={name} />;
}

type Slide = {
  title: string;
  paragraphs: { text: string; level: number }[];
  images: string[];
};

function byLocal(node: Document | Element, name: string) {
  const found = [...node.getElementsByTagNameNS("*", name)];
  if (found.length > 0) return found;
  return [...node.getElementsByTagName("*")].filter((element) => element.localName === name);
}

function prefixedAttribute(tag: string, name: string) {
  return new RegExp(`\\s[\\w-]+:${name}="([^"]*)"`).exec(tag)?.[1] ?? "";
}

function references(xml: string, element: string, attribute: string) {
  return [...xml.matchAll(new RegExp(`<(?:[\\w-]+:)?${element}\\b[^>]*>`, "g"))].map((match) =>
    prefixedAttribute(match[0], attribute),
  );
}

function relations(doc: Document | null) {
  const map = new Map<string, string>();
  if (!doc) return map;
  for (const rel of byLocal(doc, "Relationship")) {
    map.set(rel.getAttribute("Id") ?? "", rel.getAttribute("Target") ?? "");
  }
  return map;
}

function resolvePath(base: string, target: string) {
  const parts = base.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("/");
}

export async function parsePresentation(data: ArrayBuffer) {
  const JSZip = ((await import("jszip")) as { default: typeof import("jszip") }).default;
  const zip = await JSZip.loadAsync(data);
  const parser = new DOMParser();
  const text = async (path: string) => (await zip.file(path)?.async("text")) ?? null;
  const parse = (xml: string | null) => (xml ? parser.parseFromString(xml, "application/xml") : null);

  const presentation = await text("ppt/presentation.xml");
  if (!presentation) throw new Error("invalid");
  const rels = relations(parse(await text("ppt/_rels/presentation.xml.rels")));

  const slides: Slide[] = [];
  for (const id of references(presentation, "sldId", "id")) {
    const target = rels.get(id);
    if (!target) continue;
    const path = resolvePath("ppt/presentation.xml", target);
    const raw = await text(path);
    const doc = parse(raw);
    if (!raw || !doc) continue;
    const slideRels = relations(parse(await text(path.replace(/slides\/([^/]+)$/, "slides/_rels/$1.rels"))));

    let title = "";
    const paragraphs: Slide["paragraphs"] = [];
    for (const shape of byLocal(doc, "sp")) {
      const placeholder = byLocal(shape, "ph")[0]?.getAttribute("type") ?? "";
      const lines = byLocal(shape, "p")
        .map((paragraph) => ({
          text: byLocal(paragraph, "t").map((run) => run.textContent ?? "").join(""),
          level: Number(byLocal(paragraph, "pPr")[0]?.getAttribute("lvl") ?? 0),
        }))
        .filter((line) => line.text.trim() !== "");
      if (lines.length === 0) continue;
      if (!title && (placeholder === "title" || placeholder === "ctrTitle")) {
        title = lines.map((line) => line.text).join(" ");
      } else {
        paragraphs.push(...lines);
      }
    }

    const images: string[] = [];
    for (const reference of references(raw, "blip", "embed")) {
      const media = slideRels.get(reference);
      const file = media ? zip.file(resolvePath(path, media)) : null;
      if (!file || !/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(file.name)) continue;
      const blob = await file.async("blob");
      const type = file.name.endsWith(".svg") ? "image/svg+xml" : "";
      images.push(URL.createObjectURL(type ? new Blob([blob], { type }) : blob));
    }

    slides.push({ title, paragraphs, images });
  }
  return slides;
}

export function PptxView({ data }: { data: ArrayBuffer }) {
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: Slide[] = [];
    parsePresentation(data)
      .then((result) => {
        created = result;
        if (cancelled) result.forEach((slide) => slide.images.forEach((url) => URL.revokeObjectURL(url)));
        else setSlides(result);
      })
      .catch(() => !cancelled && setError("This presentation could not be opened."));
    return () => {
      cancelled = true;
      created.forEach((slide) => slide.images.forEach((url) => URL.revokeObjectURL(url)));
    };
  }, [data]);

  if (error) return <Failure message={error} />;
  if (slides === null) return <Loading label="Opening presentation…" />;
  if (slides.length === 0) return <Failure message="This presentation has no slides." />;

  return (
    <ol className="flex flex-col gap-4">
      {slides.map((slide, index) => (
        <li key={index} className="flex gap-3">
          <span className="w-6 shrink-0 pt-1 text-right text-xs text-ui-fg-faint tabular-nums">{index + 1}</span>
          <article className="flex aspect-video min-w-0 flex-1 flex-col gap-3 overflow-hidden rounded-lg border border-ui-border bg-ctp-base p-[4%] shadow-sm">
            {slide.title && (
              <h3 className="text-[clamp(1rem,2.4vw,1.6rem)] leading-tight font-semibold text-ui-fg">{slide.title}</h3>
            )}
            <div className="flex min-h-0 flex-1 gap-4">
              {slide.paragraphs.length > 0 && (
                <ul className="flex min-w-0 flex-1 flex-col gap-1.5 overflow-hidden text-[clamp(.7rem,1.4vw,1rem)] text-ui-fg">
                  {slide.paragraphs.map((paragraph, line) => (
                    <li key={line} className="flex gap-2" style={{ paddingLeft: `${paragraph.level * 1.25}em` }}>
                      <span className="text-[var(--accent)]">•</span>
                      <span className="min-w-0">{paragraph.text}</span>
                    </li>
                  ))}
                </ul>
              )}
              {slide.images.length > 0 && (
                <div className={`grid min-h-0 gap-2 ${slide.paragraphs.length > 0 ? "w-2/5" : "flex-1"}`}>
                  {slide.images.slice(0, 2).map((url) => (
                    <img key={url} src={url} alt="" className="size-full min-h-0 rounded object-contain" />
                  ))}
                </div>
              )}
            </div>
          </article>
        </li>
      ))}
    </ol>
  );
}

export function HtmlView({ html, name }: { html: string; name: string }) {
  const [mode, setMode] = useState<"preview" | "source">("preview");

  return (
    <div className="flex flex-col gap-3">
      <ModeToggle value={mode} options={[["preview", "Preview"], ["source", "Source"]]} onChange={setMode} />
      {mode === "preview" ? (
        <SandboxFrame html={html} title={name} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-ui-border-soft">
          <CodeBlock code={html} language="html" className="max-h-[70vh]" />
        </div>
      )}
    </div>
  );
}

export function ModeToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <span className="flex w-fit rounded-md border border-ui-border bg-ui-field p-0.5">
      {options.map(([option, label]) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`h-7 cursor-pointer rounded px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ui-ring ${
            value === option ? "bg-ui-raised font-medium text-ui-fg shadow-sm" : "text-ui-fg-muted hover:text-ui-fg"
          }`}
        >
          {label}
        </button>
      ))}
    </span>
  );
}
