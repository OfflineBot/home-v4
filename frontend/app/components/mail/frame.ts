type Rgba = { r: number; g: number; b: number; a: number };
type Hsl = { h: number; s: number; l: number; a: number };

const sides = ["top", "right", "bottom", "left"] as const;

const probes = {
  text: "text-ui-fg",
  muted: "text-ui-fg-muted",
  link: "text-ctp-blue",
  border: "border border-ui-border",
};

function parse(value: string): Rgba | null {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;

  const [r, g, b, a = 1] = match[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  return [r, g, b, a].some(Number.isNaN) ? null : { r, g, b, a };
}

function toHsl({ r, g, b, a }: Rgba): Hsl {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l, a };

  const s = delta / (1 - Math.abs(2 * l - 1));
  const h =
    max === red
      ? ((green - blue) / delta) % 6
      : max === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4;

  return { h: (h * 60 + 360) % 360, s, l, a };
}

function css({ h, s, l, a }: Hsl) {
  return `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(0)}% / ${a})`;
}

function background(color: Rgba) {
  const hsl = toHsl(color);
  if (hsl.a === 0 || hsl.l <= 0.5) return null;
  if (hsl.s < 0.15 && hsl.l > 0.9) return "transparent";

  return css({ ...hsl, s: hsl.s * 0.55, l: 0.12 + (1 - hsl.l) * 0.35 });
}

function text(color: Rgba, theme: Record<keyof typeof probes, string>) {
  const hsl = toHsl(color);
  if (hsl.l >= 0.6) return null;
  if (hsl.s < 0.2) return hsl.l < 0.3 ? theme.text : theme.muted;

  return css({ ...hsl, l: 0.72 + (0.6 - hsl.l) * 0.3 });
}

function border(color: Rgba, theme: Record<keyof typeof probes, string>) {
  const hsl = toHsl(color);
  if (hsl.a === 0 || hsl.l <= 0.5) return null;
  if (hsl.s < 0.15) return theme.border;

  return css({ ...hsl, s: hsl.s * 0.55, l: 0.3 });
}

export type FrameTheme = Record<keyof typeof probes, string>;

export function remapColor(
  kind: "background" | "text" | "border",
  value: string,
  theme: FrameTheme,
) {
  const color = parse(value);
  if (!color) return null;
  if (kind === "background") return background(color);
  if (kind === "text") return text(color, theme);
  return border(color, theme);
}

function themeColors(): FrameTheme {
  const read = (className: string, property: "color" | "borderTopColor") => {
    const probe = document.createElement("span");
    probe.className = className;
    document.body.appendChild(probe);
    const value = getComputedStyle(probe)[property];
    probe.remove();
    return value;
  };

  return {
    text: read(probes.text, "color"),
    muted: read(probes.muted, "color"),
    link: read(probes.link, "color"),
    border: read(probes.border, "borderTopColor"),
  };
}

export function adaptFrame(frame: HTMLIFrameElement) {
  const doc = frame.contentDocument;
  const view = frame.contentWindow;
  if (!doc?.body || !view) return;
  if (doc.documentElement.dataset.adapted) return;
  doc.documentElement.dataset.adapted = "true";
  if (document.documentElement.dataset.theme === "light") return;

  const theme = themeColors();
  const style = doc.createElement("style");
  style.textContent = `html,body{color-scheme:dark;background:transparent!important;color:${theme.text}}a{color:${theme.link}}`;
  doc.head.appendChild(style);

  for (const element of [doc.body, ...doc.body.querySelectorAll<HTMLElement>("*")]) {
    const computed = view.getComputedStyle(element);

    const fill = remapColor("background", computed.backgroundColor, theme);
    if (fill) element.style.setProperty("background-color", fill, "important");

    const ink = remapColor("text", computed.color, theme);
    if (ink) element.style.setProperty("color", ink, "important");

    for (const side of sides) {
      if (parseFloat(computed.getPropertyValue(`border-${side}-width`)) === 0) continue;
      const line = remapColor(
        "border",
        computed.getPropertyValue(`border-${side}-color`),
        theme,
      );
      if (line) element.style.setProperty(`border-${side}-color`, line, "important");
    }
  }
}
