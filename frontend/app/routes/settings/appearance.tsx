import { useState } from "react";
import { Icon } from "../../components/icons";
import { Block, Stack } from "../../components/block";
import { applyTheme, type Theme } from "../../lib/theme";

const themes: { value: Theme; label: string; flavour: string }[] = [
  { value: "dark", label: "Mocha", flavour: "Dark" },
  { value: "light", label: "Latte", flavour: "Light" },
];

// renders in the theme it advertises, not the active one — the palette blocks
// in app.css also match on a plain [data-theme] so this works nested
function Preview({ theme }: { theme: Theme }) {
  return (
    <span
      data-theme={theme}
      className="flex h-28 w-52 gap-2 rounded-md border border-ui-border bg-ui-frame p-2"
      aria-hidden
    >
      <span className="flex w-7 shrink-0 flex-col gap-1.5">
        <span className="h-2 rounded-sm bg-ctp-mauve" />
        <span className="h-2 rounded-sm bg-ctp-blue" />
        <span className="h-2 rounded-sm bg-ctp-green" />
        <span className="h-2 rounded-sm bg-ctp-peach" />
        <span className="h-2 rounded-sm bg-ctp-pink" />
      </span>
      <span className="flex flex-1 flex-col gap-1.5 rounded border border-ui-border bg-ui-surface p-2">
        <span className="h-2 w-1/3 rounded-sm bg-ui-fg" />
        <span className="h-1.5 w-full rounded-sm bg-ui-fg-muted" />
        <span className="h-1.5 w-2/3 rounded-sm bg-ui-fg-faint" />
        <span className="mt-auto flex h-7 items-center gap-1.5 rounded border border-ui-border bg-ui-raised px-1.5">
          <span className="h-1.5 flex-1 rounded-sm bg-ui-fg-muted" />
          <span className="h-3 w-8 rounded-sm bg-ctp-mauve" />
        </span>
      </span>
    </span>
  );
}

export default function AppearanceSettings() {
  const [current, setCurrent] = useState<Theme>(() =>
    typeof document === "undefined"
      ? "dark"
      : ((document.documentElement.dataset.theme as Theme) ?? "dark"),
  );

  //TODO: NOT WIRED!
  function choose(theme: Theme) {
    applyTheme(theme);
    setCurrent(theme);
  }

  return (
    <Stack>
      <Block title="Color theme">
        <div className="flex flex-wrap gap-3">
          {themes.map((theme) => {
            const active = current === theme.value;

            return (
              <button
                key={theme.value}
                type="button"
                onClick={() => choose(theme.value)}
                aria-pressed={active}
                className={`flex cursor-pointer flex-col gap-2.5 rounded-lg border p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ui-ring ${
                  active
                    ? "border-ctp-mauve bg-ui-hover"
                    : "border-ui-border hover:bg-ui-hover"
                }`}
              >
                <Preview theme={theme.value} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-ui-fg">
                    {theme.label}
                    {active && (
                      <Icon name="check" className="size-3.5 text-ctp-mauve" />
                    )}
                  </span>
                  <span className="block text-xs text-ui-fg-muted">
                    {theme.flavour}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Block>
    </Stack>
  );
}
