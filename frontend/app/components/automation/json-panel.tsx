import { useEffect, useState } from "react";
import { Block } from "../block";
import { buttonClass, primaryButtonClass } from "../setting-row";
import { codeAreaClass, Notice } from "./notice";
import { pretty, type WorkflowInput } from "../../lib/automation";

type JsonPanelProps = {
  value: WorkflowInput;
  onApply: (value: WorkflowInput) => void;
};

function parse(text: string): WorkflowInput | string {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return error instanceof Error ? error.message : "Not valid JSON.";
  }

  if (!raw || typeof raw !== "object") return "Expected an object.";
  const data = raw as Partial<WorkflowInput>;
  if (typeof data.name !== "string") return "name must be a string.";
  if (!Array.isArray(data.nodes)) return "nodes must be a list.";
  if (data.connections && typeof data.connections !== "object") return "connections must be an object.";

  for (const node of data.nodes) {
    if (!node || typeof node.name !== "string" || typeof node.type !== "string" || typeof node.typeVersion !== "number") {
      return "Every node needs name, type and typeVersion.";
    }
  }

  return {
    name: data.name,
    nodes: data.nodes.map((node) => ({
      ...node,
      id: node.id || crypto.randomUUID(),
      position: Array.isArray(node.position) ? node.position : [0, 0],
      parameters: node.parameters && typeof node.parameters === "object" ? node.parameters : {},
    })),
    connections: data.connections ?? {},
    settings: data.settings,
  };
}

export function JsonPanel({ value, onApply }: JsonPanelProps) {
  const initial = pretty(value);
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(initial);
    setError(null);
  }, [initial]);

  return (
    <Block title="Workflow JSON">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ui-fg-muted">
          The workflow in n8n format. Use it for branches or fields the editor can not show. Apply, then save.
        </p>
        <textarea
          className={`${codeAreaClass} min-h-[28rem]`}
          spellCheck={false}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass} disabled={text === initial} onClick={() => setText(initial)}>
            Reset
          </button>
          <button
            type="button"
            className={primaryButtonClass}
            disabled={text === initial}
            onClick={() => {
              const parsed = parse(text);
              if (typeof parsed === "string") {
                setError(parsed);
                return;
              }
              setError(null);
              onApply(parsed);
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </Block>
  );
}
