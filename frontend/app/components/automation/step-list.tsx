import { Badge } from "../block";
import { Icon } from "../icons";
import { NodeIcon } from "./node-icon";
import { iconButtonClass, smallButtonClass } from "./notice";
import {
  descriptionIconInfo,
  descriptionKey,
  type NodeDescription,
  type WorkflowNode,
} from "../../lib/automation";

export type StepIssue = "connection" | "description";

type StepListProps = {
  nodes: WorkflowNode[];
  descriptions: Record<string, NodeDescription>;
  issues: Record<string, StepIssue | undefined>;
  selected: string | null;
  editable: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
};

export function StepList({
  nodes,
  descriptions,
  issues,
  selected,
  editable,
  onSelect,
  onMove,
  onRemove,
  onAdd,
}: StepListProps) {
  return (
    <ol className="flex flex-col">
      {nodes.map((node, index) => {
        const description = descriptions[descriptionKey(node.type, node.typeVersion)];
        const active = node.id === selected;
        const issue = issues[node.id];
        const info = description
          ? descriptionIconInfo(description)
          : { label: node.type, url: null, icon: null, color: null };

        return (
          <li key={node.id} className="flex flex-col">
            {index > 0 && (
              <span className="ml-[1.375rem] h-4 w-px bg-ui-border" aria-hidden />
            )}
            <div
              className={`group flex items-center gap-3 rounded-lg border p-2.5 transition-colors motion-reduce:transition-none ${
                active
                  ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]"
                  : "border-ui-border-soft bg-ui-surface hover:bg-ui-hover"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(node.id)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ui-ring"
              >
                <NodeIcon info={info} />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-sm font-medium ${node.disabled ? "text-ui-fg-faint line-through" : "text-ui-fg"}`}
                  >
                    {node.name}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-xs text-ui-fg-muted">
                      {index === 0 ? "Trigger · " : ""}
                      {description?.displayName ?? node.type}
                    </span>
                  </span>
                </span>
                {issue === "connection" && <Badge tone="bad">Needs connection</Badge>}
                {issue === "description" && <Badge tone="bad">Unknown</Badge>}
              </button>

              {editable && (
                <span className="flex shrink-0 flex-col opacity-70 group-hover:opacity-100">
                  <button
                    type="button"
                    className={iconButtonClass}
                    aria-label={`Move ${node.name} up`}
                    disabled={index <= 1}
                    onClick={() => onMove(node.id, -1)}
                  >
                    <Icon name="chevron" className="size-3.5 -rotate-90" />
                  </button>
                  <button
                    type="button"
                    className={iconButtonClass}
                    aria-label={`Move ${node.name} down`}
                    disabled={index === 0 || index === nodes.length - 1}
                    onClick={() => onMove(node.id, 1)}
                  >
                    <Icon name="chevron" className="size-3.5 rotate-90" />
                  </button>
                </span>
              )}
              {editable && (
                <button
                  type="button"
                  className={iconButtonClass}
                  aria-label={`Remove ${node.name}`}
                  title="Remove step"
                  onClick={() => onRemove(node.id)}
                >
                  <Icon name="trash" className="size-4" />
                </button>
              )}
            </div>
          </li>
        );
      })}

      {editable && (
        <li className="flex flex-col">
          {nodes.length > 0 && <span className="ml-[1.375rem] h-4 w-px bg-ui-border" aria-hidden />}
          <button type="button" className={`${smallButtonClass} h-9! justify-center`} onClick={onAdd}>
            <Icon name="plus" className="size-4" />
            {nodes.length === 0 ? "Choose a trigger" : "Add step"}
          </button>
        </li>
      )}
    </ol>
  );
}
