import { useEffect, useState } from "react";

export type ThemeName = "catppuccin-mocha" | "catppuccin-latte";

export type Token = { content: string; color?: string; fontStyle?: number };

type Highlighter = {
  codeToTokens: (
    code: string,
    options: { lang: string; theme: ThemeName },
  ) => { tokens: Token[][] };
  loadLanguage: (...langs: string[]) => Promise<void>;
  getLoadedLanguages: () => string[];
};

let pending: Promise<{ highlighter: Highlighter; known: Set<string> }> | null = null;

async function load() {
  pending ??= (async () => {
    const shiki = await import("shiki");
    const highlighter = (await shiki.createHighlighter({
      themes: ["catppuccin-mocha", "catppuccin-latte"],
      langs: [],
      engine: shiki.createJavaScriptRegexEngine(),
    })) as unknown as Highlighter;
    const known = new Set([
      ...Object.keys(shiki.bundledLanguages),
      ...Object.keys(shiki.bundledLanguagesAlias ?? {}),
    ]);
    return { highlighter, known };
  })();
  return pending;
}

export async function highlight(code: string, language: string, theme: ThemeName) {
  const { highlighter, known } = await load();
  if (!known.has(language)) return null;
  if (!highlighter.getLoadedLanguages().includes(language)) await highlighter.loadLanguage(language);
  return highlighter.codeToTokens(code, { lang: language, theme }).tokens;
}

function currentTheme(): ThemeName {
  return document.documentElement.dataset.theme === "light" ? "catppuccin-latte" : "catppuccin-mocha";
}

export function useThemeName() {
  const [theme, setTheme] = useState<ThemeName>("catppuccin-mocha");

  useEffect(() => {
    setTheme(currentTheme());
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
