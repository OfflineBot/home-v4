import { Link } from "react-router";
import { Icon } from "../icons";
import {
  isActiveFolder,
  mailHref,
  orderFolders,
  type MailFolder,
} from "../../lib/mail";

type FolderListProps = {
  folders: MailFolder[];
  current: string;
  className?: string;
};

export function FolderList({ folders, current, className = "" }: FolderListProps) {
  return (
    <nav
      aria-label="Mail folders"
      className={`flex-col gap-0.5 overflow-y-auto rounded-xl border border-ui-border bg-ui-raised p-2 ${className}`}
    >
      {orderFolders(folders).map(({ folder, depth }) => {
        const active = isActiveFolder(folder, current);

        return (
          <Link
            key={folder.id}
            to={mailHref({ folder: folder.id })}
            preventScrollReset
            aria-current={active ? "page" : undefined}
            style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
            className={`flex h-9 shrink-0 items-center gap-2 rounded-md pr-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-ring motion-reduce:transition-none ${
              active
                ? "bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent-fg)]"
                : "text-ui-fg-muted hover:bg-ui-hover hover:text-ui-fg"
            }`}
          >
            <Icon name="mail" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
            {folder.unread > 0 && (
              <span className="shrink-0 text-xs font-semibold text-[var(--accent-fg)] tabular-nums">
                {folder.unread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
