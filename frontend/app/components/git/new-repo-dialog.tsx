import { useEffect, useState } from "react";
import { Dialog } from "../dialog";
import { Icon } from "../icons";
import { Field, buttonClass, inputClass, primaryButtonClass, textareaClass } from "../setting-row";
import { gitApi, gitError, maxDescription, nameError, type Project, type Repo } from "../../lib/git";

const newProject = "__new__";
const checkDelayMs = 300;

type Availability = { state: "idle" | "checking" | "ok" | "bad"; message: string };

export function NewRepoDialog({
  open,
  projects,
  initialProject,
  onCreated,
  onClose,
}: {
  open: boolean;
  projects: Project[];
  initialProject?: string;
  onCreated: (repo: Repo) => void;
  onClose: () => void;
}) {
  const [project, setProject] = useState(newProject);
  const [projectName, setProjectName] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [availability, setAvailability] = useState<Availability>({ state: "idle", message: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProject(initialProject ?? projects[0]?.name ?? newProject);
    setProjectName("");
    setName("");
    setDescription("");
    setVisibility("private");
    setError(null);
    setAvailability({ state: "idle", message: "" });
  }, [open, initialProject, projects]);

  useEffect(() => {
    if (project !== newProject) return;
    const value = projectName.trim();
    if (value === "") {
      setAvailability({ state: "idle", message: "" });
      return;
    }
    const local = nameError(value);
    if (local) {
      setAvailability({ state: "bad", message: local });
      return;
    }
    setAvailability({ state: "checking", message: "" });
    const timer = window.setTimeout(() => {
      gitApi
        .checkProject(value)
        .then((result) => {
          if (!result) return setAvailability({ state: "idle", message: "" });
          setAvailability(
            result.available
              ? { state: "ok", message: "Available" }
              : { state: "bad", message: gitError(result.reason, 409) },
          );
        })
        .catch(() => setAvailability({ state: "idle", message: "" }));
    }, checkDelayMs);
    return () => window.clearTimeout(timer);
  }, [project, projectName]);

  async function submit() {
    setError(null);
    const creatingProject = project === newProject;
    const target = creatingProject ? projectName.trim() : project;
    const problem =
      (creatingProject ? nameError(target) : null) ??
      (availability.state === "bad" && creatingProject ? availability.message : null) ??
      nameError(name) ??
      (description.length > maxDescription ? `The description can have at most ${maxDescription} characters.` : null);
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    try {
      if (creatingProject) await gitApi.createProject(target);
      const repo = await gitApi.createRepo({
        project: target,
        name: name.trim(),
        description: description.replace(/\s+/g, " ").trim(),
        private: visibility === "private",
      });
      onCreated(repo);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} title="New repository" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Project">
          <select
            value={project}
            onChange={(event) => setProject(event.target.value)}
            className={`${inputClass} cursor-pointer`}
          >
            {projects.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {entry.name}
              </option>
            ))}
            <option value={newProject}>New project…</option>
          </select>
        </Field>

        {project === newProject && (
          <Field label="Project name">
            <span className="relative block">
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                maxLength={64}
                className={`${inputClass} pr-9 font-mono ${availability.state === "bad" ? "border-ui-danger!" : ""}`}
              />
              <span className="absolute top-1/2 right-2.5 -translate-y-1/2">
                {availability.state === "checking" && (
                  <span className="block size-2 animate-pulse rounded-full bg-ui-fg-faint motion-reduce:animate-none" />
                )}
                {availability.state === "ok" && <Icon name="check" className="size-4 text-ctp-green" />}
                {availability.state === "bad" && <Icon name="alert" className="size-4 text-ui-danger" />}
              </span>
            </span>
            {availability.state === "bad" && <span className="text-xs text-ui-danger">{availability.message}</span>}
          </Field>
        )}

        <Field label="Repository name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            className={`${inputClass} font-mono`}
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value.replace(/[\r\n]+/g, " "))}
            maxLength={maxDescription}
            rows={2}
            className={textareaClass}
          />
        </Field>

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs text-ui-fg-muted">Visibility</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["private", "Private", "security", "Only you"],
                ["public", "Public", "user", "Anyone can clone"],
              ] as const
            ).map(([value, label, icon, detail]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ui-ring motion-reduce:transition-none ${
                  visibility === value
                    ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]"
                    : "border-ui-border hover:bg-ui-hover"
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={value}
                  checked={visibility === value}
                  onChange={() => setVisibility(value)}
                  className="sr-only"
                />
                <Icon name={icon} className={`size-4 ${visibility === value ? "text-[var(--accent)]" : "text-ui-fg-muted"}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ui-fg">{label}</span>
                  <span className="block text-xs text-ui-fg-muted">{detail}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {error && <p className="text-sm text-ui-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClass}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={primaryButtonClass}>
            {busy ? "Creating…" : "Create repository"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
