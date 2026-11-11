import { filesApi, joinPath } from "../../lib/files";

export type SiteFile = { file: Blob; relative: string; size: number };

const concurrency = 3;
const ignored = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/;

export function stripCommonRoot(items: SiteFile[]) {
  const usable = items.filter((item) => item.relative && !ignored.test(item.relative));
  const firsts = new Set(usable.map((item) => item.relative.split("/")[0]));
  const nested = usable.every((item) => item.relative.includes("/"));
  if (firsts.size !== 1 || !nested) return usable;
  const [root] = firsts;
  return usable.map((item) => ({ ...item, relative: item.relative.slice(root.length + 1) }));
}

export function fromPicked(list: { file: File; relative: string }[]) {
  return stripCommonRoot(list.map(({ file, relative }) => ({ file, relative, size: file.size })));
}

export async function fromZip(file: File) {
  const JSZip = ((await import("jszip")) as { default: typeof import("jszip") }).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const items: SiteFile[] = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const blob = await entry.async("blob");
    items.push({ file: blob, relative: entry.name.replace(/^\/+/, ""), size: blob.size });
  }
  return stripCommonRoot(items);
}

export function hasIndex(items: SiteFile[]) {
  return items.some((item) => item.relative.toLowerCase() === "index.html");
}

export async function uploadSite(
  folder: string,
  items: SiteFile[],
  onProgress: (done: number, loaded: number, total: number) => void,
) {
  const total = items.reduce((sum, item) => sum + item.size, 0);
  const progress = new Map<number, number>();
  let done = 0;
  let next = 0;

  const report = () => {
    let loaded = 0;
    for (const value of progress.values()) loaded += value;
    onProgress(done, loaded, total);
  };

  async function worker() {
    while (next < items.length) {
      const index = next++;
      const item = items[index];
      await filesApi.upload(joinPath(folder, item.relative), item.file, {
        overwrite: true,
        onProgress: (loaded) => {
          progress.set(index, loaded);
          report();
        },
      });
      progress.set(index, item.size);
      done += 1;
      report();
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}
