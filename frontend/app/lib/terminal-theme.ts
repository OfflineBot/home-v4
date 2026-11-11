import type { ITheme } from "@xterm/xterm";

export const terminalFontFamily =
  '"JetBrainsMono Nerd Font", "JetBrainsMono NF", "JetBrains Mono", "Symbols Nerd Font Mono", ui-monospace, monospace';

export const terminalFontHref =
  "https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap";

export async function loadTerminalFont(size: number) {
  try {
    await Promise.all([
      document.fonts.load(`400 ${size}px "JetBrains Mono"`),
      document.fonts.load(`700 ${size}px "JetBrains Mono"`),
    ]);
  } catch {
    return;
  }
}

export function terminalTheme(): ITheme {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const color = (name: string) => css.getPropertyValue(`--ctp-${name}`).trim();
  const alpha = (name: string, value: string) => `${color(name)}${value}`;
  const light = root.dataset.theme === "light";

  return {
    background: color("mantle"),
    foreground: color("text"),
    cursor: color("rosewater"),
    cursorAccent: color("mantle"),
    selectionBackground: alpha("overlay2", light ? "4d" : "59"),
    selectionInactiveBackground: alpha("overlay0", "40"),
    scrollbarSliderBackground: alpha("overlay0", "40"),
    scrollbarSliderHoverBackground: alpha("overlay0", "80"),
    scrollbarSliderActiveBackground: alpha("overlay1", "a0"),
    black: color(light ? "subtext1" : "surface1"),
    red: color("red"),
    green: color("green"),
    yellow: color("yellow"),
    blue: color("blue"),
    magenta: color("pink"),
    cyan: color("teal"),
    white: color(light ? "surface2" : "subtext1"),
    brightBlack: color(light ? "subtext0" : "surface2"),
    brightRed: color("red"),
    brightGreen: color("green"),
    brightYellow: color("yellow"),
    brightBlue: color("blue"),
    brightMagenta: color("pink"),
    brightCyan: color("teal"),
    brightWhite: color(light ? "surface1" : "subtext0"),
  };
}
