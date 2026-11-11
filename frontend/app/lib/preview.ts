export type PreviewKind =
  | "image"
  | "pdf"
  | "video"
  | "audio"
  | "markdown"
  | "html"
  | "code"
  | "text"
  | "docx"
  | "pptx"
  | "none";

export type PreviewSource = {
  name: string;
  url?: string;
  text?: string;
  mime?: string;
  size?: number;
};

export const textLimit = 2 * 1024 * 1024;
export const documentLimit = 60 * 1024 * 1024;

const languages: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "jsonc",
  go: "go",
  py: "python",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  rb: "ruby",
  lua: "lua",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "fish",
  ps1: "powershell",
  sql: "sql",
  css: "css",
  scss: "scss",
  html: "html",
  htm: "html",
  xml: "xml",
  svg: "xml",
  vue: "vue",
  svelte: "svelte",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  conf: "ini",
  md: "markdown",
  markdown: "markdown",
  dockerfile: "dockerfile",
  makefile: "makefile",
  tex: "latex",
  r: "r",
  swift: "swift",
  dart: "dart",
  zig: "zig",
  nix: "nix",
  diff: "diff",
  patch: "diff",
  desktop: "ini",
  env: "dotenv",
  csv: "csv",
  gradle: "groovy",
  ipynb: "json",
};

const fileNames: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  ".gitignore": "ini",
  ".env": "dotenv",
  "caddyfile": "ini",
};

function extension(name: string) {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot > 0 ? lower.slice(dot + 1) : "";
}

export function languageFor(name: string) {
  const lower = name.toLowerCase().split("/").pop() ?? "";
  return fileNames[lower] ?? languages[extension(lower)] ?? "text";
}

const plainText = new Set(["txt", "log", "nfo", "text", "out", "lst"]);

export function previewKind(name: string, mime = ""): PreviewKind {
  const ext = extension(name);
  const type = mime.toLowerCase();

  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "svg"].includes(ext) || type.startsWith("image/")) {
    return "image";
  }
  if (ext === "pdf" || type === "application/pdf") return "pdf";
  if (["mp4", "webm", "mov", "m4v", "ogv"].includes(ext) || type.startsWith("video/")) return "video";
  if (["mp3", "wav", "ogg", "oga", "flac", "m4a", "opus", "aac"].includes(ext) || type.startsWith("audio/")) return "audio";
  if (ext === "md" || ext === "markdown" || type === "text/markdown") return "markdown";
  if (ext === "html" || ext === "htm" || type === "text/html") return "html";
  if (ext === "docx" || type.includes("wordprocessingml")) return "docx";
  if (ext === "pptx" || type.includes("presentationml")) return "pptx";
  if (plainText.has(ext)) return "text";
  if (languageFor(name) !== "text") return "code";
  if (type.startsWith("text/") || type === "application/json" || type.endsWith("+xml")) return "text";
  return "none";
}

export const kindLabels: Record<PreviewKind, string> = {
  image: "Image",
  pdf: "PDF",
  video: "Video",
  audio: "Audio",
  markdown: "Markdown",
  html: "HTML",
  code: "Code",
  text: "Text",
  docx: "Word",
  pptx: "PowerPoint",
  none: "File",
};
