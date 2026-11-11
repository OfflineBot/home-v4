import type { FileChange } from "../../lib/git";

type DiffLine = {
  kind: "hunk" | "add" | "del" | "context";
  text: string;
  old: number | null;
  new: number | null;
};

function parsePatch(patch: string) {
  const out: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of patch.replace(/\n$/, "").split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      out.push({ kind: "hunk", text: line, old: null, new: null });
    } else if (line.startsWith("+")) {
      out.push({ kind: "add", text: line.slice(1), old: null, new: newLine++ });
    } else if (line.startsWith("-")) {
      out.push({ kind: "del", text: line.slice(1), old: oldLine++, new: null });
    } else {
      out.push({ kind: "context", text: line.slice(1), old: oldLine++, new: newLine++ });
    }
  }

  return out;
}

const lineTone = {
  hunk: "bg-[color-mix(in_oklab,var(--ctp-blue)_10%,transparent)] text-ctp-blue",
  add: "bg-[color-mix(in_oklab,var(--ctp-green)_12%,transparent)] text-ui-fg",
  del: "bg-[color-mix(in_oklab,var(--ctp-red)_12%,transparent)] text-ui-fg",
  context: "text-ui-fg",
};

const markTone = {
  hunk: "",
  add: "text-ctp-green",
  del: "text-ctp-red",
  context: "text-ui-fg-faint",
};

export function DiffView({ change }: { change: FileChange }) {
  const lines = parsePatch(change.patch);

  return (
    <div className="overflow-x-auto bg-ctp-mantle">
      <table className="w-full border-collapse font-mono text-[13px] leading-5">
        <tbody>
          {lines.map((line, index) => (
            <tr key={index} className={lineTone[line.kind]}>
              {line.kind === "hunk" ? (
                <td colSpan={4} className="px-4 py-1 text-xs whitespace-pre">
                  {line.text}
                </td>
              ) : (
                <>
                  <td className="w-0 px-2 text-right text-ui-fg-faint select-none">{line.old ?? ""}</td>
                  <td className="w-0 border-r border-ui-border-soft px-2 text-right text-ui-fg-faint select-none">
                    {line.new ?? ""}
                  </td>
                  <td className={`w-0 pl-3 select-none ${markTone[line.kind]}`}>
                    {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
                  </td>
                  <td className="pr-4 pl-2 whitespace-pre">{line.text || " "}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChangeStat({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions;
  const blocks = 5;
  const green = total === 0 ? 0 : Math.round((additions / total) * blocks);

  return (
    <span className="flex items-center gap-2 font-mono text-xs tabular-nums">
      <span className="text-ctp-green">+{additions}</span>
      <span className="text-ctp-red">−{deletions}</span>
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: blocks }, (_, index) => (
          <span
            key={index}
            className={`size-2 rounded-[2px] ${
              total === 0 ? "bg-ui-field" : index < green ? "bg-ctp-green" : "bg-ctp-red"
            }`}
          />
        ))}
      </span>
    </span>
  );
}
