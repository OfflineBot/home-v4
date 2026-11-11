import { useEffect, useMemo, useState } from "react";
import { Dialog } from "../dialog";
import { Badge } from "../block";
import { inputClass } from "../setting-row";
import { NodeIcon } from "./node-icon";
import { Notice } from "./notice";
import {
  automationApi,
  hiddenTriggers,
  nodeIconInfo,
  type NodeSummary,
} from "../../lib/automation";

type NodePickerProps = {
  open: boolean;
  triggers: boolean;
  onClose: () => void;
  onPick: (node: NodeSummary) => void;
};

const listLimit = 150;
const featured = [
  "n8n-nodes-base.webhook",
  "n8n-nodes-base.scheduleTrigger",
  "n8n-nodes-base.rssFeedReadTrigger",
  "n8n-nodes-base.telegramTrigger",
  "n8n-nodes-base.emailReadImap",
  "n8n-nodes-base.discord",
  "n8n-nodes-base.telegram",
  "n8n-nodes-base.emailSend",
  "n8n-nodes-base.set",
  "n8n-nodes-base.if",
  "n8n-nodes-base.filter",
  "n8n-nodes-base.wait",
  "n8n-nodes-base.dateTime",
];

export function NodePicker({ open, triggers, onClose, onPick }: NodePickerProps) {
  const [nodes, setNodes] = useState<NodeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [source, setSource] = useState<"home" | "n8n">("home");

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCategory(null);

    automationApi.nodes().then((result) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNodes(result.data.nodes);
      const hasHome = result.data.nodes.some(
        (node) => node.custom && node.trigger === triggers && !node.sub_node,
      );
      setSource(hasHome ? "home" : "n8n");
    });
  }, [open, triggers]);

  const usable = useMemo(
    () =>
      (nodes ?? []).filter(
        (node) =>
          !node.sub_node &&
          node.trigger === triggers &&
          !(triggers && hiddenTriggers.has(node.name)),
      ),
    [nodes, triggers],
  );
  const homeCount = usable.filter((node) => node.custom).length;
  const pool = useMemo(
    () => usable.filter((node) => node.custom === (source === "home")),
    [usable, source],
  );

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of pool) {
      for (const name of node.categories) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name);
  }, [pool]);

  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = pool.filter(
      (node) =>
        (!category || node.categories.includes(category)) &&
        (!term ||
          node.display_name.toLowerCase().includes(term) ||
          node.description.toLowerCase().includes(term) ||
          node.name.toLowerCase().includes(term)),
    );

    if (term || category) return list;

    const rank = (node: NodeSummary) => {
      const index = featured.indexOf(node.name);
      return index === -1 ? featured.length : index;
    };
    return [...list].sort((a, b) => rank(a) - rank(b));
  }, [pool, query, category]);

  return (
    <Dialog open={open} title={triggers ? "Choose how it starts" : "Add a step"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <input
          autoFocus
          className={inputClass}
          placeholder={triggers ? "Search triggers, e.g. Schedule, Webhook, RSS" : "Search, e.g. Discord, Telegram, If"}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div role="tablist" aria-label="Component lists" className="flex rounded-lg border border-ui-border-soft bg-ui-surface p-0.5">
          {(
            [
              { id: "home", label: `Home components (${homeCount})` },
              { id: "n8n", label: `n8n components (${usable.length - homeCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={source === tab.id}
              onClick={() => {
                setSource(tab.id);
                setCategory(null);
              }}
              className={`h-8 flex-1 cursor-pointer rounded-md px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ui-ring ${
                source === tab.id ? "bg-ui-raised text-ui-fg shadow-sm" : "text-ui-fg-muted hover:text-ui-fg"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {source === "home" && homeCount === 0 && nodes && (
          <Notice>
            {triggers
              ? "No home trigger available. Check that n8n loads the home-v4 nodes."
              : "No home components available. Check that n8n loads the home-v4 nodes."}
          </Notice>
        )}

        {source === "n8n" && categories.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {[null, ...categories].map((name) => (
              <button
                key={name ?? "all"}
                type="button"
                onClick={() => setCategory(name)}
                className={`h-6 cursor-pointer rounded-full border px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ui-ring ${
                  category === name
                    ? "border-ctp-mauve text-ui-fg"
                    : "border-ui-border-soft text-ui-fg-muted hover:bg-ui-hover"
                }`}
              >
                {name ?? "All"}
              </button>
            ))}
          </div>
        )}

        {error && <Notice tone="bad">{error}</Notice>}
        {!nodes && !error && <p className="text-sm text-ui-fg-muted">Loading nodes…</p>}

        {nodes && (
          <ul className="-mx-1 flex max-h-96 flex-col overflow-y-auto">
            {shown.slice(0, listLimit).map((node) => (
              <li key={node.name}>
                <button
                  type="button"
                  onClick={() => onPick(node)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left outline-none hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-ring"
                >
                  <NodeIcon info={nodeIconInfo(node)} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm text-ui-fg">{node.display_name}</span>
                      {node.admin_only && <Badge>Admin</Badge>}
                    </span>
                    <span className="block truncate text-xs text-ui-fg-muted">{node.description}</span>
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="px-2 py-2 text-sm text-ui-fg-muted">Nothing matches.</li>
            )}
          </ul>
        )}

        {shown.length > listLimit && (
          <p className="text-xs text-ui-fg-faint">
            Showing {listLimit} of {shown.length}. Keep typing to narrow it down.
          </p>
        )}
      </div>
    </Dialog>
  );
}
