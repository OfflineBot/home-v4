import { useEffect, useState } from "react";
import { highlight, useThemeName, type Token } from "./highlight";

const highlightLimit = 300 * 1024;
const lineLimit = 8000;

export function CodeBlock({
  code,
  language,
  lineNumbers = true,
  className = "",
}: {
  code: string;
  language: string;
  lineNumbers?: boolean;
  className?: string;
}) {
  const theme = useThemeName();
  const source = code.replace(/\n$/, "");
  const lines = source.split("\n");
  const [tokens, setTokens] = useState<{ key: string; lines: Token[][] } | null>(null);
  const key = `${theme}:${language}:${source.length}:${source.slice(0, 64)}`;

  useEffect(() => {
    if (language === "text" || source.length > highlightLimit || lines.length > lineLimit) return;
    let cancelled = false;
    highlight(source, language, theme)
      .then((result) => {
        if (!cancelled && result) setTokens({ key, lines: result });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key, language, source, theme, lines.length]);

  const colored = tokens?.key === key ? tokens.lines : null;
  const width = String(lines.length).length;

  return (
    <div className={`overflow-auto bg-ctp-mantle ${className}`}>
      <table className="w-full border-collapse font-mono text-[13px] leading-5">
        <tbody>
          {lines.map((line, index) => (
            <tr key={index} className="hover:bg-ui-hover/50">
              {lineNumbers && (
                <td
                  className="sticky left-0 w-0 border-r border-ui-border-soft bg-ctp-mantle px-3 text-right align-top text-ui-fg-faint select-none"
                  style={{ minWidth: `${width + 2}ch` }}
                >
                  {index + 1}
                </td>
              )}
              <td className="px-4 whitespace-pre text-ui-fg">
                {colored?.[index]?.length
                  ? colored[index].map((token, position) => (
                      <span
                        key={position}
                        style={{
                          color: token.color,
                          fontStyle: token.fontStyle && token.fontStyle & 1 ? "italic" : undefined,
                          fontWeight: token.fontStyle && token.fontStyle & 2 ? 600 : undefined,
                          textDecoration: token.fontStyle && token.fontStyle & 4 ? "underline" : undefined,
                        }}
                      >
                        {token.content}
                      </span>
                    ))
                  : line || " "}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
