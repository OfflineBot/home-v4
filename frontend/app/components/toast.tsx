import { useEffect, useState } from "react";
import { Icon } from "./icons";

type ToastProps = {
  message: string | null;
};

export function Toast({ message }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;

    // one frame late, so the element mounts hidden and then transitions in
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [message]);

  if (!message) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`fixed top-3 right-3 z-50 flex w-72 items-start gap-3 rounded-lg border border-ui-border bg-ui-raised p-3 transition-[opacity,transform] duration-200 ease-out ${
        visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
      }`}
    >
      <span className="grid size-5 shrink-0 place-items-center text-ui-danger">
        <Icon name="alert" />
      </span>

      <p className="min-w-0 flex-1 text-sm text-ui-fg">{message}</p>

      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="grid size-5 shrink-0 cursor-pointer place-items-center rounded text-ui-fg-muted outline-none hover:text-ui-fg focus-visible:ring-2 focus-visible:ring-ui-ring"
      >
        <Icon name="close" className="size-3.5" />
      </button>
    </div>
  );
}
