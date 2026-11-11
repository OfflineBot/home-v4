import { useEffect, useRef, useState } from "react";
import { Dialog } from "../dialog";
import { FolderPickerDialog } from "../files/folder-picker";
import { droppedFiles, pickedFiles } from "../files/use-uploads";
import { Icon } from "../icons";
import { Field, buttonClass, inputClass, primaryButtonClass } from "../setting-row";
import { fromPicked, fromZip, hasIndex, uploadSite, type SiteFile } from "./site-upload";
import { FilesError, filesApi } from "../../lib/files";
import { formatBytes } from "../../lib/format";
import type { Project } from "../../lib/git";
import { pageError, pageNameError, pagesApi, type PageInput, type SitePage } from "../../lib/pages";

type Check = { state: "idle" | "checking" | "ok" | "bad"; message: string };
type Mode = "git" | "files" | "upload";

const checkDelayMs = 300;
const sitesRoot = "/Sites";

function initialInput(page: SitePage | null, projects: Project[]): PageInput {
  if (page) {
    return {
      name: page.name,
      title: page.title,
      source: page.source,
      project: page.project ?? "",
      repo: page.repo ?? "",
      ref: page.ref,
      folder: page.folder,
      spa: page.spa,
    };
  }
  const firstRepo = projects.flatMap((project) => project.repos)[0];
  return {
    name: "",
    title: "",
    source: firstRepo ? "git" : "files",
    project: firstRepo?.project ?? "",
    repo: firstRepo?.name ?? "",
    ref: "",
    folder: firstRepo ? "" : "/",
    spa: false,
  };
}

function siteFolder(name: string) {
  return `${sitesRoot}/${name}`;
}

async function folderExists(path: string) {
  try {
    const listing = await filesApi.list(path);
    return listing.entries.length > 0;
  } catch (error) {
    if (error instanceof FilesError && error.code === "not_found") return false;
    throw error;
  }
}

export function PageDialog({
  open,
  page,
  projects,
  onSaved,
  onClose,
}: {
  open: boolean;
  page: SitePage | null;
  projects: Project[];
  onSaved: (page: SitePage) => void;
  onClose: () => void;
}) {
  const editing = page !== null;
  const [input, setInput] = useState<PageInput>(() => initialInput(page, projects));
  const [mode, setMode] = useState<Mode>(() => (page ? page.source : initialInput(null, projects).source));
  const [check, setCheck] = useState<Check>({ state: "idle", message: "" });
  const [branches, setBranches] = useState<{ name: string; default: boolean }[]>([]);
  const [upload, setUpload] = useState<SiteFile[]>([]);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; loaded: number; total: number; count: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const repos = projects.flatMap((project) => project.repos);

  useEffect(() => {
    if (!open) return;
    const next = initialInput(page, projects);
    setInput(next);
    setMode(next.source);
    setUpload([]);
    setProgress(null);
    setError(null);
    setCheck({ state: "idle", message: "" });
  }, [open, page, projects]);

  useEffect(() => {
    if (!open || editing) return;
    const name = input.name.trim();
    if (name === "") return setCheck({ state: "idle", message: "" });
    const local = pageNameError(name);
    if (local) return setCheck({ state: "bad", message: local });
    setCheck({ state: "checking", message: "" });
    const timer = window.setTimeout(() => {
      pagesApi
        .check(name)
        .then((result) => {
          if (!result) return setCheck({ state: "idle", message: "" });
          setCheck(result.available ? { state: "ok", message: "" } : { state: "bad", message: pageError(result.reason, 409) });
        })
        .catch(() => setCheck({ state: "idle", message: "" }));
    }, checkDelayMs);
    return () => window.clearTimeout(timer);
  }, [open, editing, input.name]);

  useEffect(() => {
    if (!open || mode !== "git" || !input.project || !input.repo) {
      setBranches([]);
      return;
    }
    let cancelled = false;
    pagesApi.branches(input.project, input.repo).then((list) => !cancelled && setBranches(list));
    return () => {
      cancelled = true;
    };
  }, [open, mode, input.project, input.repo]);

  function update(values: Partial<PageInput>) {
    setInput((current) => ({ ...current, ...values }));
  }

  function changeMode(next: Mode) {
    setMode(next);
    if (next === "git") update({ source: "git", folder: "" });
    else if (next === "files") update({ source: "files", folder: page?.source === "files" ? page.folder : "/" });
    else update({ source: "files" });
  }

  async function readSelection(task: () => Promise<SiteFile[]>) {
    setReading(true);
    setError(null);
    try {
      setUpload(await task());
    } catch {
      setError("These files could not be read.");
    } finally {
      setReading(false);
    }
  }

  async function submit() {
    setError(null);
    const name = editing ? page.name : input.name.trim();
    const problem =
      (!editing ? pageNameError(input.name) : null) ??
      (!editing && check.state === "bad" ? check.message : null) ??
      (mode === "git" && (!input.project || !input.repo) ? "Choose a repository." : null) ??
      (mode === "upload" && upload.length === 0 ? "Choose the files of the website." : null);
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    try {
      let values = input;
      if (mode === "upload") {
        const folder = editing && page.source === "files" && page.folder.startsWith(`${sitesRoot}/`) ? page.folder : siteFolder(name);
        if (!editing && (await folderExists(folder))) {
          throw new Error(`The folder ${folder} already exists in Files. Choose another name.`);
        }
        if (editing && (await folderExists(folder))) await filesApi.remove(folder);
        setProgress({ done: 0, loaded: 0, total: upload.reduce((sum, item) => sum + item.size, 0), count: upload.length });
        await uploadSite(folder, upload, (done, loaded, total) => setProgress({ done, loaded, total, count: upload.length }));
        values = { ...input, source: "files", folder };
      }
      const saved = editing ? await pagesApi.update(page.name, values) : await pagesApi.create(values);
      onSaved(saved);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const repoValue = input.project && input.repo ? `${input.project}/${input.repo}` : "";
  const uploadSize = upload.reduce((sum, item) => sum + item.size, 0);
  const modes: [Mode, string, string][] = [
    ["upload", "Upload", "upload"],
    ["git", "Git repository", "git"],
    ["files", "Files folder", "files"],
  ];

  return (
    <>
      <Dialog open={open} title={editing ? `Edit ${page.name}` : "New page"} onClose={onClose}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <span className="relative block">
                <input
                  value={input.name}
                  onChange={(event) => update({ name: event.target.value })}
                  readOnly={editing}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={64}
                  className={`${inputClass} pr-9 font-mono ${editing ? "cursor-default opacity-70" : ""} ${check.state === "bad" ? "border-ui-danger!" : ""}`}
                />
                {!editing && (
                  <span className="absolute top-1/2 right-2.5 -translate-y-1/2">
                    {check.state === "checking" && <span className="block size-2 animate-pulse rounded-full bg-ui-fg-faint motion-reduce:animate-none" />}
                    {check.state === "ok" && <Icon name="check" className="size-4 text-ctp-green" />}
                    {check.state === "bad" && <Icon name="alert" className="size-4 text-ui-danger" />}
                  </span>
                )}
              </span>
              {check.state === "bad" && <span className="text-xs text-ui-danger">{check.message}</span>}
            </Field>
            <Field label="Title">
              <input
                value={input.title}
                onChange={(event) => update({ title: event.target.value })}
                maxLength={120}
                autoComplete="off"
                className={inputClass}
              />
            </Field>
          </div>

          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs text-ui-fg-muted">Source</legend>
            <div className="grid grid-cols-3 gap-2">
              {modes.map(([value, label, icon]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ui-ring motion-reduce:transition-none ${
                    mode === value
                      ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]"
                      : "border-ui-border hover:bg-ui-hover"
                  }`}
                >
                  <input type="radio" name="source" checked={mode === value} onChange={() => changeMode(value)} className="sr-only" />
                  <Icon name={icon} className={`size-5 ${mode === value ? "text-[var(--accent)]" : "text-ui-fg-muted"}`} />
                  <span className="text-xs font-medium text-ui-fg">{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {mode === "upload" && (
            <div className="flex flex-col gap-2">
              <div
                onDragOver={(event) => {
                  if (![...event.dataTransfer.types].includes("Files")) return;
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const transfer = event.dataTransfer;
                  const single = transfer.files.length === 1 ? transfer.files[0] : null;
                  if (single && /\.zip$/i.test(single.name)) void readSelection(() => fromZip(single));
                  else {
                    const pending = droppedFiles(transfer);
                    void readSelection(async () => fromPicked(await pending));
                  }
                }}
                className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-5 text-center transition-colors motion-reduce:transition-none ${
                  dragging ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]" : "border-ui-border"
                }`}
              >
                <Icon name="upload" className={`size-6 ${dragging ? "text-[var(--accent)]" : "text-ui-fg-faint"}`} />
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => folderInput.current?.click()} className={buttonClass}>
                    Folder
                  </button>
                  <button type="button" onClick={() => filesInput.current?.click()} className={buttonClass}>
                    Files
                  </button>
                  <button type="button" onClick={() => zipInput.current?.click()} className={buttonClass}>
                    ZIP
                  </button>
                </div>
                <input
                  ref={folderInput}
                  type="file"
                  hidden
                  {...{ webkitdirectory: "", directory: "" }}
                  onChange={(event) => {
                    const picked = pickedFiles(event.target.files);
                    event.target.value = "";
                    void readSelection(async () => fromPicked(picked));
                  }}
                />
                <input
                  ref={filesInput}
                  type="file"
                  multiple
                  hidden
                  onChange={(event) => {
                    const picked = pickedFiles(event.target.files);
                    event.target.value = "";
                    void readSelection(async () => fromPicked(picked));
                  }}
                />
                <input
                  ref={zipInput}
                  type="file"
                  accept=".zip,application/zip"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void readSelection(() => fromZip(file));
                  }}
                />
              </div>

              {reading && <p className="text-xs text-ui-fg-muted">Reading files…</p>}
              {upload.length > 0 && !reading && (
                <div className="flex flex-col gap-1.5 rounded-lg border border-ui-border bg-ui-field p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Icon name={hasIndex(upload) ? "check" : "alert"} className={`size-4 ${hasIndex(upload) ? "text-ctp-green" : "text-ctp-yellow"}`} />
                    <span className="flex-1 text-ui-fg">
                      {upload.length} {upload.length === 1 ? "file" : "files"} · {formatBytes(uploadSize)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setUpload([])}
                      aria-label="Clear selection"
                      className="grid size-6 cursor-pointer place-items-center rounded text-ui-fg-faint hover:bg-ui-hover hover:text-ui-fg"
                    >
                      <Icon name="close" className="size-3.5" />
                    </button>
                  </div>
                  {!hasIndex(upload) && <p className="text-xs text-ctp-yellow">No index.html at the top level.</p>}
                  <ul className="max-h-24 overflow-y-auto font-mono text-xs text-ui-fg-muted">
                    {upload.slice(0, 50).map((item) => (
                      <li key={item.relative} className="truncate">
                        {item.relative}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {editing && page.source === "files" && (
                <p className="text-xs text-ui-fg-muted">The current files move to the archive and are replaced.</p>
              )}
            </div>
          )}

          {mode === "git" &&
            (repos.length === 0 ? (
              <p className="rounded-lg border border-dashed border-ui-border p-3 text-sm text-ui-fg-muted">No repositories yet.</p>
            ) : (
              <>
                <Field label="Repository">
                  <select
                    value={repoValue}
                    onChange={(event) => {
                      const [project, ...rest] = event.target.value.split("/");
                      update({ project, repo: rest.join("/"), ref: "" });
                    }}
                    className={`${inputClass} cursor-pointer font-mono`}
                  >
                    {!repoValue && <option value="" />}
                    {projects
                      .filter((project) => project.repos.length > 0)
                      .map((project) => (
                        <optgroup key={project.name} label={project.name}>
                          {project.repos.map((repo) => (
                            <option key={repo.name} value={`${repo.project}/${repo.name}`}>
                              {repo.project}/{repo.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                  </select>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Branch">
                    <select
                      value={input.ref}
                      onChange={(event) => update({ ref: event.target.value })}
                      className={`${inputClass} cursor-pointer font-mono`}
                    >
                      <option value="">Default branch</option>
                      {branches
                        .filter((branch) => !branch.default)
                        .map((branch) => (
                          <option key={branch.name} value={branch.name}>
                            {branch.name}
                          </option>
                        ))}
                      {input.ref && !branches.some((branch) => branch.name === input.ref) && <option value={input.ref}>{input.ref}</option>}
                    </select>
                  </Field>
                  <Field label="Folder in repository">
                    <input
                      value={input.folder}
                      onChange={(event) => update({ folder: event.target.value })}
                      autoComplete="off"
                      spellCheck={false}
                      className={`${inputClass} font-mono`}
                    />
                  </Field>
                </div>
              </>
            ))}

          {mode === "files" && (
            <Field label="Folder">
              <span className="flex gap-2">
                <input readOnly value={input.folder || "/"} className={`${inputClass} font-mono`} />
                <button type="button" onClick={() => setPicking(true)} className={`${buttonClass} inline-flex items-center gap-1.5`}>
                  <Icon name="folder" className="size-4" />
                  Choose
                </button>
              </span>
            </Field>
          )}

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-ui-border p-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ui-fg">Single-page app</span>
              <span className="block text-xs text-ui-fg-muted">Unknown paths load index.html</span>
            </span>
            <input
              type="checkbox"
              checked={input.spa}
              onChange={(event) => update({ spa: event.target.checked })}
              className="size-4 cursor-pointer accent-[var(--accent)]"
            />
          </label>

          {progress && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-ui-fg-muted tabular-nums">
                <span>
                  Uploading {Math.min(progress.done + 1, progress.count)} of {progress.count}
                </span>
                <span>{progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 100}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-ui-field">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200 motion-reduce:transition-none"
                  style={{ width: `${progress.total > 0 ? (progress.loaded / progress.total) * 100 : 100}%` }}
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-ui-danger">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy && progress !== null} className={buttonClass}>
              Cancel
            </button>
            <button type="submit" disabled={busy || reading} className={primaryButtonClass}>
              {busy ? (progress ? "Uploading…" : "Saving…") : editing ? "Save" : "Create page"}
            </button>
          </div>
        </form>
      </Dialog>
      <FolderPickerDialog
        open={picking}
        start={input.folder || "/"}
        title="Choose folder"
        onPick={(folder) => {
          update({ folder });
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </>
  );
}
