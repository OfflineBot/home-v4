import { useCallback, useEffect, useRef, useState } from "react";
import { FilesError, filesApi, joinPath } from "../../lib/files";

export type UploadItem = {
  id: number;
  name: string;
  path: string;
  size: number;
  loaded: number;
  status: "queued" | "uploading" | "done" | "error" | "conflict" | "cancelled";
  error: string | null;
  overwrite: boolean;
};

export type PickedFile = { file: File; relative: string };

const concurrency = 3;
let uploadCounter = 0;

export function useUploads(onSettled: () => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const current = useRef<UploadItem[]>([]);
  const files = useRef(new Map<number, File>());
  const controllers = useRef(new Map<number, AbortController>());
  const running = useRef(0);
  const settled = useRef(onSettled);

  useEffect(() => {
    settled.current = onSettled;
  });

  const update = useCallback((change: (list: UploadItem[]) => UploadItem[]) => {
    current.current = change(current.current);
    setItems(current.current);
  }, []);

  const patch = useCallback(
    (id: number, values: Partial<UploadItem>) => {
      update((list) => list.map((item) => (item.id === id ? { ...item, ...values } : item)));
    },
    [update],
  );

  const pump = useCallback(() => {
    const slots = concurrency - running.current;
    if (slots <= 0) return;

    const starting = current.current.filter((item) => item.status === "queued").slice(0, slots);
    if (starting.length === 0) return;

    const ids = new Set(starting.map((item) => item.id));
    update((list) => list.map((item) => (ids.has(item.id) ? { ...item, status: "uploading" } : item)));

    for (const item of starting) {
      const file = files.current.get(item.id);
      if (!file) {
        patch(item.id, { status: "error", error: "The file is no longer available." });
        continue;
      }

      const controller = new AbortController();
      controllers.current.set(item.id, controller);
      running.current += 1;

      filesApi
        .upload(item.path, file, {
          overwrite: item.overwrite,
          signal: controller.signal,
          onProgress: (loaded) => patch(item.id, { loaded }),
        })
        .then(() => {
          patch(item.id, { status: "done", loaded: item.size, error: null });
          files.current.delete(item.id);
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            patch(item.id, { status: "cancelled" });
            files.current.delete(item.id);
          } else if (error instanceof FilesError && error.code === "exists") {
            patch(item.id, { status: "conflict", error: null, loaded: 0 });
          } else {
            patch(item.id, { status: "error", error: error instanceof Error ? error.message : "Failed." });
          }
        })
        .finally(() => {
          running.current -= 1;
          controllers.current.delete(item.id);
          settled.current();
          pump();
        });
    }
  }, [patch, update]);

  const enqueue = useCallback(
    (folder: string, picked: PickedFile[]) => {
      if (picked.length === 0) return;
      const added: UploadItem[] = picked.map(({ file, relative }) => {
        uploadCounter += 1;
        files.current.set(uploadCounter, file);
        return {
          id: uploadCounter,
          name: relative,
          path: joinPath(folder, relative),
          size: file.size,
          loaded: 0,
          status: "queued",
          error: null,
          overwrite: false,
        };
      });
      update((list) => [...list, ...added]);
      pump();
    },
    [pump, update],
  );

  const resolveConflicts = useCallback(
    (replace: boolean) => {
      update((list) =>
        list.map((item) => {
          if (item.status !== "conflict") return item;
          if (!replace) {
            files.current.delete(item.id);
            return { ...item, status: "cancelled" };
          }
          return { ...item, status: "queued", overwrite: true, loaded: 0 };
        }),
      );
      if (replace) pump();
    },
    [pump, update],
  );

  const cancel = useCallback(
    (id: number) => {
      const controller = controllers.current.get(id);
      if (controller) {
        controller.abort();
        return;
      }
      files.current.delete(id);
      update((list) =>
        list.map((item) => (item.id === id && item.status === "queued" ? { ...item, status: "cancelled" } : item)),
      );
    },
    [update],
  );

  const dismiss = useCallback(() => {
    for (const controller of controllers.current.values()) controller.abort();
    for (const item of current.current) {
      if (item.status === "queued" || item.status === "conflict") files.current.delete(item.id);
    }
    update((list) => list.filter((item) => item.status === "uploading"));
    const pending = window.setInterval(() => {
      if (running.current > 0) return;
      window.clearInterval(pending);
      update(() => []);
    }, 100);
  }, [update]);

  const clear = useCallback(() => {
    update((list) =>
      list.filter((item) => item.status === "queued" || item.status === "uploading" || item.status === "conflict"),
    );
  }, [update]);

  const busy = items.some((item) => item.status === "queued" || item.status === "uploading");
  const conflicts = busy ? [] : items.filter((item) => item.status === "conflict");

  return { items, enqueue, cancel, clear, dismiss, resolveConflicts, conflicts, busy };
}

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (success: (file: File) => void, failure: (error: unknown) => void) => void;
  createReader?: () => {
    readEntries: (success: (entries: FileSystemEntryLike[]) => void, failure: (error: unknown) => void) => void;
  };
};

async function walk(entry: FileSystemEntryLike, prefix: string, out: PickedFile[]) {
  const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
    out.push({ file, relative });
    return;
  }
  if (!entry.isDirectory || !entry.createReader) return;

  const reader = entry.createReader();
  while (true) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    for (const child of batch) await walk(child, relative, out);
  }
}

export async function droppedFiles(transfer: DataTransfer) {
  const out: PickedFile[] = [];
  const entries = [...transfer.items]
    .filter((item) => item.kind === "file")
    .map((item) => (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntryLike | null }).webkitGetAsEntry?.() ?? null);

  if (entries.some((entry) => entry !== null)) {
    for (const entry of entries) if (entry) await walk(entry, "", out);
    return out;
  }

  for (const file of transfer.files) out.push({ file, relative: file.name });
  return out;
}

export function pickedFiles(list: FileList | null) {
  return [...(list ?? [])].map((file) => ({
    file,
    relative: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
}
