import { useState } from "react";
import { Icon } from "../../components/icons";
import {
  SettingsPanel,
  SettingsSection,
} from "../../components/settings-section";
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
      className="flex h-12 w-20 shrink-0 gap-1 rounded-md border border-ui-border bg-ui-frame p-1.5"
      aria-hidden
    >
      <span className="flex w-3 flex-col gap-1">
        <span className="h-1.5 rounded-xs bg-ctp-mauve" />
        <span className="h-1.5 rounded-xs bg-ctp-blue" />
        <span className="h-1.5 rounded-xs bg-ctp-green" />
      </span>
      <span className="flex flex-1 flex-col gap-1 rounded-sm bg-ui-surface p-1">
        <span className="h-1 w-full rounded-xs bg-ui-fg-muted" />
        <span className="h-1 w-2/3 rounded-xs bg-ui-fg-faint" />
        <span className="mt-auto h-2 w-full rounded-xs bg-ui-raised" />
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

  function choose(theme: Theme) {
    applyTheme(theme);
    setCurrent(theme);
  }

  return (
    <SettingsPanel>
      <SettingsSection title="Color theme">
        <div className="flex flex-wrap gap-3">
          {themes.map((theme) => {
            const active = current === theme.value;

            return (
              <button
                key={theme.value}
                type="button"
                onClick={() => choose(theme.value)}
                aria-pressed={active}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2 pr-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ui-ring ${
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
      </SettingsSection>
    </SettingsPanel>
  );
}
