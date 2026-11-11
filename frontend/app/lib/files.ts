export type FileEntry = {
  name: string;
  path: string;
  type: "dir" | "file";
  size: number;
  modified: string;
  mime_type?: string;
};

export type Listing = {
  path: string;
  parent: string | null;
  entries: FileEntry[];
};

export type Usage = {
  folder: string;
  used_bytes: number;
  files: number;
  free_bytes: number;
  total_bytes: number;
};

export type SortKey = "name" | "size" | "modified";

export type ArchiveItem = {
  id: string;
  name: string;
  original_path: string;
  type: "dir" | "file";
  size: number;
  deleted_at: string;
  expires_at: string;
};

export type ArchiveListing = {
  retention_days: number;
  items: ArchiveItem[];
};

export type ArchiveInfo = { supported: boolean; count: number; retention: number };

const maxSegmentBytes = 255;

export function normalizePath(raw: string | null | undefined) {
  const parts: string[] = [];
  for (const part of (raw ?? "").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}`;
}

export function joinPath(dir: string, name: string) {
  return normalizePath(`${dir}/${name}`);
}

export function parentPath(path: string) {
  const clean = normalizePath(path);
  if (clean === "/") return null;
  return clean.slice(0, clean.lastIndexOf("/")) || "/";
}

export function baseName(path: string) {
  const clean = normalizePath(path);
  return clean === "/" ? "" : clean.slice(clean.lastIndexOf("/") + 1);
}

export function pathSegments(path: string) {
  const parts = normalizePath(path).split("/").filter(Boolean);
  return parts.map((name, index) => ({ name, path: `/${parts.slice(0, index + 1).join("/")}` }));
}

export function isInside(path: string, folder: string) {
  const target = normalizePath(path);
  const base = normalizePath(folder);
  return target === base || target.startsWith(base === "/" ? "/" : `${base}/`);
}

export function nameError(raw: string) {
  const name = raw.trim();
  if (name === "") return "Enter a name.";
  if (name === "." || name === "..") return "This name is not allowed.";
  if (name.includes("/") || name.includes("\0")) return "Names cannot contain /.";
  if (new TextEncoder().encode(name).length > maxSegmentBytes) return "This name is too long.";
  return null;
}

export function filesHref(path: string) {
  const clean = normalizePath(path);
  return clean === "/" ? "/files" : `/files?${new URLSearchParams({ path: clean })}`;
}

export function sortEntries(entries: FileEntry[], key: SortKey, descending: boolean) {
  const direction = descending ? -1 : 1;
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    const order =
      key === "size"
        ? a.size - b.size
        : key === "modified"
          ? Date.parse(a.modified) - Date.parse(b.modified)
          : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    return (order || a.name.localeCompare(b.name)) * direction;
  });
}

export type EntryKind = { label: string; color: string; preview: "image" | "text" | null };

const kinds: [RegExp, EntryKind][] = [
  [/\.pdf$/i, { label: "PDF", color: "red", preview: null }],
  [/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i, { label: "Image", color: "pink", preview: "image" }],
  [/\.(mp4|mkv|mov|webm|avi)$/i, { label: "Video", color: "mauve", preview: null }],
  [/\.(mp3|flac|wav|ogg|m4a|opus)$/i, { label: "Audio", color: "flamingo", preview: null }],
  [/\.(zip|tar|gz|tgz|xz|7z|rar|zst)$/i, { label: "Archive", color: "yellow", preview: null }],
  [/\.(docx?|odt|rtf)$/i, { label: "Document", color: "blue", preview: null }],
  [/\.(xlsx?|ods|csv|tsv)$/i, { label: "Sheet", color: "green", preview: null }],
  [/\.(pptx?|odp|key)$/i, { label: "Slides", color: "peach", preview: null }],
  [
    /\.(ts|tsx|js|jsx|mjs|go|py|rs|c|h|cpp|java|kt|sh|fish|lua|rb|php|sql|html|css|scss|json|ya?ml|toml|xml|ini|conf)$/i,
    { label: "Code", color: "teal", preview: "text" },
  ],
  [/\.(md|txt|log|nfo)$/i, { label: "Text", color: "lavender", preview: "text" }],
];

export function entryKind(entry: Pick<FileEntry, "name" | "type" | "mime_type">): EntryKind {
  if (entry.type === "dir") return { label: "Folder", color: "sapphire", preview: null };
  const found = kinds.find(([pattern]) => pattern.test(entry.name))?.[1];
  if (found) return found;
  if (entry.mime_type?.startsWith("image/")) return { label: "Image", color: "pink", preview: "image" };
  if (entry.mime_type?.startsWith("text/")) return { label: "Text", color: "lavender", preview: "text" };
  return { label: "File", color: "overlay2", preview: null };
}

const errorMessages: Record<string, string> = {
  invalid_path: "This name or path is not allowed.",
  not_found: "This item no longer exists.",
  exists: "An item with this name already exists.",
  not_a_folder: "The target is not a folder.",
  is_a_folder: "A folder with this name already exists.",
  root: "The storage root cannot be changed.",
  into_itself: "A folder cannot be moved into itself.",
  unavailable: "The storage is not available.",
  unreachable: "Backend not reachable",
};

export function filesError(code: string | undefined, status: number) {
  return (code && errorMessages[code]) || `Failed (${status})`;
}

export class FilesError extends Error {
  constructor(
    readonly code: string | undefined,
    status: number,
  ) {
    super(filesError(code, status));
  }
}

const endpoint = "/files/api";

async function send(body: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new FilesError("unreachable", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new FilesError(data?.error, res.status);
  return data;
}

export type UploadOptions = {
  overwrite: boolean;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
};

export const filesApi = {
  async list(path: string): Promise<Listing> {
    let res: Response;
    try {
      res = await fetch(`${endpoint}?${new URLSearchParams({ op: "list", path })}`);
    } catch {
      throw new FilesError("unreachable", 0);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new FilesError(data?.error, res.status);
    return data as Listing;
  },
  mkdir: (path: string) => send({ op: "mkdir", path }),
  move: (path: string, to: string, overwrite = false) => send({ op: "move", path, to, overwrite }),
  remove: (path: string) => send({ op: "delete", path }),
  restore: (id: string, overwrite = false) => send({ op: "archive-restore", id, overwrite }),
  purge: (id: string) => send({ op: "archive-delete", id }),
  emptyArchive: () => send({ op: "archive-empty" }),
  downloadHref: (path: string) => `${endpoint}?${new URLSearchParams({ op: "download", path })}`,
  previewHref: (path: string) => `${endpoint}?${new URLSearchParams({ op: "download", path, inline: "1" })}`,
  archiveHref: (path: string) => `${endpoint}?${new URLSearchParams({ op: "archive", path })}`,
  upload(path: string, file: Blob, options: UploadOptions) {
    return new Promise<FileEntry>((resolve, reject) => {
      const request = new XMLHttpRequest();
      const params = new URLSearchParams({ path, overwrite: options.overwrite ? "1" : "0" });
      request.open("PUT", `${endpoint}?${params}`);
      request.responseType = "json";
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) options.onProgress?.(event.loaded, event.total);
      };
      request.onload = () => {
        const data = request.response ?? {};
        if (request.status >= 200 && request.status < 300) resolve(data as FileEntry);
        else reject(new FilesError(data?.error, request.status));
      };
      request.onerror = () => reject(new FilesError("unreachable", 0));
      request.onabort = () => reject(new DOMException("Aborted", "AbortError"));
      options.signal?.addEventListener("abort", () => request.abort(), { once: true });
      request.send(file);
    });
  },
};
