import { Badge, ExpandableBlock } from "../block";
import { Icon } from "../icons";
import {
  fileKind,
  formatSize,
  htmlToText,
  mediaHref,
  moduleKind,
  type MoodleFile,
  type MoodleModule,
  type MoodleSection,
} from "../../lib/moodle";
import { accentVars, navColor } from "../../lib/nav";

function visibleFiles(module: MoodleModule) {
  return (module.files ?? []).filter((file) => !file.embedded);
}

export function SectionBlock({
  section,
  defaultOpen,
}: {
  section: MoodleSection;
  defaultOpen: boolean;
}) {
  const modules = section.modules ?? [];
  const files = modules.flatMap(visibleFiles);
  const links = files.filter((file) => file.link).length;
  const summary = htmlToText(section.summary);

  return (
    <ExpandableBlock
      title={section.name || `Section ${section.number}`}
      icon="files"
      color={navColor("moodle")}
      defaultOpen={defaultOpen}
      summary={
        <>
          {files.length - links > 0 && (
            <Badge>{files.length - links} files</Badge>
          )}
          {links > 0 && <Badge>{links} links</Badge>}
        </>
      }
    >
      {summary && (
        <p className="mb-4 text-sm whitespace-pre-line text-ui-fg-muted">
          {summary}
        </p>
      )}

      {modules.length === 0 ? (
        <p className="text-sm text-ui-fg-muted">Nothing in this section.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {modules.map((module) => (
            <ModuleItem key={module.id} module={module} />
          ))}
        </ul>
      )}
    </ExpandableBlock>
  );
}

function ModuleItem({ module }: { module: MoodleModule }) {
  const kind = moduleKind(module.modname);
  const files = visibleFiles(module);
  const description = htmlToText(module.description);

  if (module.modname === "label") {
    return description ? (
      <li className="rounded-lg bg-ui-surface px-3 py-2 text-sm whitespace-pre-line text-ui-fg-muted">
        {description}
      </li>
    ) : null;
  }

  return (
    <li
      style={{ ...accentVars(kind.color), marginLeft: `${module.indent * 1.25}rem` }}
      className="overflow-hidden rounded-lg border border-ui-border-soft"
    >
      <div className="flex items-center gap-3 bg-ui-surface px-3 py-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-[var(--accent)]">
          <Icon name={kind.icon} className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ui-fg">
          {module.name}
        </span>
        <span className="hidden shrink-0 text-xs text-[var(--accent-fg)] sm:inline">
          {kind.label}
        </span>
        {files.length === 0 && module.url && (
          <a
            href={module.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-xs text-ui-fg-muted underline-offset-4 hover:text-ui-fg hover:underline"
          >
            Open in Moodle
          </a>
        )}
      </div>

      {description && (
        <p className="line-clamp-3 border-t border-ui-border-soft px-3 py-2 text-sm whitespace-pre-line text-ui-fg-muted">
          {description}
        </p>
      )}

      {files.length > 0 && (
        <ul className="divide-y divide-ui-border-soft border-t border-ui-border-soft">
          {files.map((file) => (
            <li key={file.id}>
              <FileLink file={file} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function FileLink({ file }: { file: MoodleFile }) {
  const kind = fileKind(file);
  const href = file.link ?? mediaHref("file", file.id);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={accentVars(kind.color)}
      className="flex min-w-0 items-center gap-3 px-3 py-2 text-sm outline-none transition-colors hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring focus-visible:ring-inset motion-reduce:transition-none"
    >
      <span className="w-11 shrink-0 rounded bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] py-0.5 text-center font-mono text-[10px] font-semibold text-[var(--accent-fg)]">
        {kind.label}
      </span>
      <span className="min-w-0 flex-1 truncate text-ui-fg">
        {file.filepath && file.filepath !== "/" ? (
          <span className="text-ui-fg-muted">{file.filepath.replace(/^\/|\/$/g, "")}/</span>
        ) : null}
        {file.filename}
      </span>
      {file.link ? (
        <Icon name="chevron" className="size-3.5 shrink-0 -rotate-45 text-ui-fg-muted" />
      ) : (
        <span className="shrink-0 text-xs text-ui-fg-muted tabular-nums">
          {formatSize(file.filesize)}
        </span>
      )}
    </a>
  );
}
