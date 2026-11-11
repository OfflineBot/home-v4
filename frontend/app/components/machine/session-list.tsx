import { useId } from "react";
import { Icon } from "../icons";
import { inputClass, primaryButtonClass } from "../setting-row";

type SessionListProps = {
  recent: string[];
  open: string[];
  onOpen: (name: string) => void;
  onCreate: () => void;
  onForget: (name: string) => void;
};

export function SessionList({ recent, open, onOpen, onCreate, onForget }: SessionListProps) {
  const inputId = useId();

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onCreate}
        className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-ui-fg outline-none hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring"
      >
        <Icon name="plus" className="size-4 text-[var(--accent)]" />
        New session
      </button>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem("session") as HTMLInputElement;
          onOpen(input.value);
        }}
        className="flex flex-col gap-1 px-2 pt-1 pb-2"
      >
        <label htmlFor={inputId} className="text-xs text-ui-fg-muted">
          Session
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            name="session"
            autoComplete="off"
            spellCheck={false}
            className={`${inputClass} h-8 font-mono text-[13px]`}
          />
          <button type="submit" className={`${primaryButtonClass} h-8 px-3`}>
            Open
          </button>
        </div>
      </form>

      {recent.length > 0 && (
        <>
          <div className="border-t border-ui-border-soft" />
          <p className="px-2 pt-1 text-xs font-medium tracking-wide text-ui-fg-faint uppercase">
            Recent
          </p>
          <ul className="flex max-h-64 flex-col overflow-y-auto">
            {recent.map((name) => (
              <li key={name} className="group flex items-center gap-1 rounded-md hover:bg-ui-hover">
                <button
                  type="button"
                  onClick={() => onOpen(name)}
                  className="flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ui-ring"
                >
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${
                      open.includes(name) ? "bg-[var(--accent)]" : "bg-ui-border-strong"
                    }`}
                  />
                  <span className="min-w-0 truncate font-mono text-[13px] text-ui-fg">{name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onForget(name)}
                  aria-label={`Remove ${name} from recent`}
                  title="Remove from recent"
                  className="mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-ui-fg-faint opacity-0 outline-none group-hover:opacity-100 hover:text-ui-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ui-ring"
                >
                  <Icon name="close" className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
