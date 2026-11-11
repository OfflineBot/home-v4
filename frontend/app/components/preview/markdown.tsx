import type { ReactNode } from "react";
import { Link } from "react-router";
import { CodeBlock } from "./code-block";
import { languageFor } from "../../lib/preview";

type LinkResolver = (target: string) => string | null;

const inlinePattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

function safeExternal(target: string) {
  return /^(https?:|mailto:)/i.test(target);
}

function inline(text: string, resolve: LinkResolver, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let index = 0;

  for (const match of text.matchAll(inlinePattern)) {
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const token = match[0];
    const id = `${key}-${index++}`;

    if (match[1]) {
      out.push(
        <code key={id} className="rounded bg-ui-field px-1.5 py-0.5 font-mono text-[0.85em] text-ctp-peach">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (match[2]) {
      out.push(
        <strong key={id} className="font-semibold text-ui-fg">
          {inline(token.slice(2, -2), resolve, id)}
        </strong>,
      );
    } else if (match[3]) {
      const label = token.slice(1, token.indexOf("]("));
      const target = token.slice(token.indexOf("](") + 2, -1);
      const internal = !safeExternal(target) ? resolve(target) : null;
      out.push(
        internal ? (
          <Link key={id} to={internal} className="text-ctp-blue underline-offset-2 hover:underline">
            {inline(label, resolve, id)}
          </Link>
        ) : safeExternal(target) ? (
          <a key={id} href={target} target="_blank" rel="noreferrer" className="text-ctp-blue underline-offset-2 hover:underline">
            {inline(label, resolve, id)}
          </a>
        ) : (
          <span key={id}>{inline(label, resolve, id)}</span>
        ),
      );
    } else {
      out.push(
        <em key={id} className="italic">
          {inline(token.slice(1, -1), resolve, id)}
        </em>,
      );
    }
    last = start + token.length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

function cells(line: string) {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

const headingClasses = [
  "border-b border-ui-border-soft pb-2 text-2xl font-semibold text-ui-fg",
  "border-b border-ui-border-soft pb-1.5 text-xl font-semibold text-ui-fg",
  "text-lg font-semibold text-ui-fg",
  "text-base font-semibold text-ui-fg",
  "text-sm font-semibold text-ui-fg",
  "text-sm font-semibold text-ui-fg-muted",
];

const noLinks: LinkResolver = () => null;

function fenceLanguage(raw: string) {
  if (!raw) return "text";
  const mapped = languageFor(`x.${raw}`);
  return mapped === "text" ? raw.toLowerCase() : mapped;
}

export function Markdown({ source, resolve = noLinks }: { source: string; resolve?: LinkResolver }) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const key = `block-${index}`;

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const fence = /^```\s*([\w+-]*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) body.push(lines[index++]);
      index += 1;
      blocks.push(
        <div key={key} className="overflow-hidden rounded-lg border border-ui-border-soft">
          <CodeBlock code={body.join("\n")} language={fenceLanguage(fence[1])} lineNumbers={false} className="py-2" />
        </div>,
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const Tag = `h${level}` as "h1";
      blocks.push(
        <Tag key={key} className={headingClasses[level - 1]}>
          {inline(heading[2], resolve, key)}
        </Tag>,
      );
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key} className="border-ui-border-soft" />);
      index += 1;
      continue;
    }

    if (line.startsWith(">")) {
      const body: string[] = [];
      while (index < lines.length && lines[index].startsWith(">")) body.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push(
        <blockquote key={key} className="border-l-2 border-[var(--accent)] pl-4 text-ui-fg-muted">
          {inline(body.join(" "), resolve, key)}
        </blockquote>,
      );
      continue;
    }

    if (line.trim().startsWith("|") && lines[index + 1] && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
      const head = cells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) rows.push(cells(lines[index++]));
      blocks.push(
        <div key={key} className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {head.map((cell, column) => (
                  <th key={column} className="border border-ui-border-soft bg-ui-surface px-3 py-1.5 text-left font-semibold text-ui-fg">
                    {inline(cell, resolve, `${key}-h${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, column) => (
                    <td key={column} className="border border-ui-border-soft px-3 py-1.5 text-ui-fg">
                      {inline(cell, resolve, `${key}-${rowIndex}-${column}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const listMatch = /^\s*([-*+]|\d+\.)\s+/.exec(line);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[1]);
      const items: string[] = [];
      while (index < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[index])) {
        items.push(lines[index++].replace(/^\s*([-*+]|\d+\.)\s+/, ""));
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={key} className={`flex flex-col gap-1 pl-6 ${ordered ? "list-decimal" : "list-disc"} marker:text-ui-fg-faint`}>
          {items.map((item, itemIndex) => {
            const task = /^\[([ xX])\]\s+(.*)$/.exec(item);
            return (
              <li key={itemIndex} className={task ? "-ml-6 flex list-none items-start gap-2" : ""}>
                {task && (
                  <input type="checkbox" checked={task[1] !== " "} readOnly className="mt-1 size-3.5 accent-[var(--accent)]" />
                )}
                <span>{inline(task ? task[2] : item, resolve, `${key}-${itemIndex}`)}</span>
              </li>
            );
          })}
        </List>,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !/^(#{1,6}\s|```|>|\s*([-*+]|\d+\.)\s+|\s*\|)/.test(lines[index])
    ) {
      paragraph.push(lines[index++]);
    }
    if (paragraph.length === 0) paragraph.push(lines[index++]);
    blocks.push(
      <p key={key} className="leading-relaxed">
        {inline(paragraph.join(" "), resolve, key)}
      </p>,
    );
  }

  return <div className="flex flex-col gap-4 text-sm text-ui-fg">{blocks}</div>;
}
