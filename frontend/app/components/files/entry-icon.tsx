import { Icon } from "../icons";
import { entryKind, type FileEntry } from "../../lib/files";
import { accentVars } from "../../lib/nav";

export function EntryIcon({
  entry,
  large = false,
}: {
  entry: Pick<FileEntry, "name" | "type" | "mime_type">;
  large?: boolean;
}) {
  const kind = entryKind(entry);
  const extension =
    entry.type === "file" && entry.name.includes(".")
      ? (entry.name.split(".").pop() ?? "").slice(0, 4).toUpperCase()
      : "";

  return (
    <span
      style={accentVars(kind.color)}
      className={`relative grid shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent)] ${
        large ? "size-14" : "size-8"
      }`}
    >
      <Icon name={entry.type === "dir" ? "folder" : "file"} className={large ? "size-7" : "size-[18px]"} />
      {large && extension && (
        <span className="absolute -bottom-1 rounded bg-[var(--accent)] px-1 font-mono text-[9px] leading-3.5 font-semibold text-ui-frame">
          {extension}
        </span>
      )}
    </span>
  );
}
