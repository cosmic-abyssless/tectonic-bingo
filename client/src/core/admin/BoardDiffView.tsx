// A Board diff (CONTEXT.md "Publish"): what a Publish changes, Tile by Tile. Shown on the Publish screen before it, and
// in the audit log's Board published entry after it.
import type { BoardChangeKind, BoardDiff, BoardFieldChange, BoardNodeChange, ExclusivityRule } from "@bingo/shared";
import { Badge } from "../ui/Card";
import { Disclosure } from "../ui/Disclosure";

const CHANGE: Record<BoardChangeKind, { label: string; tone: "ok" | "danger" | "info" }> = {
  added: { label: "Added", tone: "ok" },
  removed: { label: "Removed", tone: "danger" },
  changed: { label: "Changed", tone: "info" },
};

function Fields({ fields }: { fields: BoardFieldChange[] }) {
  if (fields.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-on-surface-muted">
      {fields.map((f, i) => (
        <li key={i}>
          <span className="text-on-surface">{f.field}:</span> {f.before ? <span className="line-through decoration-on-surface-subtle">{f.before}</span> : null}
          {f.before && f.after ? " → " : null}
          {f.after ? <span className="text-on-surface">{f.after}</span> : f.before ? " (cleared)" : null}
        </li>
      ))}
    </ul>
  );
}

function NodeRow({ node }: { node: BoardNodeChange }) {
  return (
    <li className="pl-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={CHANGE[node.change].tone}>{CHANGE[node.change].label}</Badge>
        <span className="text-on-surface-subtle">{node.path.length ? `${node.path.join(" › ")} › ` : ""}</span>
        <span className="text-on-surface">{node.name}</span>
        {node.summary && <span className="text-xs text-on-surface-subtle">({node.summary})</span>}
      </div>
      <Fields fields={node.fields} />
    </li>
  );
}

function describeRule(rule: ExclusivityRule): string {
  return `${rule.label} (one ${rule.scope} only): ${rule.itemNames.join(", ")}`;
}

/** True when the diff changes nothing. */
export function isEmptyDiff(diff: BoardDiff): boolean {
  return diff.tiles.length + diff.lines.length + diff.categories.length === 0 && !diff.exclusivityRules && !diff.rulesMarkdown;
}

/** Everything a Publish changes on the Published board: the Publish screen's, and a Board published entry's in the audit log. */
export function BoardDiffView({ diff }: { diff: BoardDiff }) {
  return (
    <div className="space-y-3">
      {diff.tiles.length > 0 && (
        <ul className="space-y-3">
          {diff.tiles.map((tile) => (
            <li key={tile.tileId} className="rounded-md border border-outline p-3">
              <div className="flex items-center gap-2">
                <Badge tone={CHANGE[tile.change].tone}>{CHANGE[tile.change].label}</Badge>
                <span className="font-medium text-on-surface">{tile.name}</span>
              </div>
              <Fields fields={tile.fields} />
              {tile.nodes.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {tile.nodes.map((n) => (
                    <NodeRow key={`${n.change}${n.nodeId}`} node={n} />
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {diff.lines.length > 0 && (
        <div>
          <p className="font-medium text-on-surface">Lines</p>
          <ul className="space-y-1.5">
            {diff.lines.map((l) => (
              <li key={l.lineId}>
                <Badge tone={CHANGE[l.change].tone}>{CHANGE[l.change].label}</Badge> <span className="text-on-surface">{l.name}</span>
                <Fields fields={l.fields} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {diff.categories.length > 0 && (
        <div>
          <p className="font-medium text-on-surface">Categories</p>
          <ul className="space-y-1.5">
            {diff.categories.map((c) => (
              <li key={c.categoryId}>
                <Badge tone={CHANGE[c.change].tone}>{CHANGE[c.change].label}</Badge> <span className="text-on-surface">{c.name}</span>
                <Fields fields={c.fields} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {diff.exclusivityRules && (
        <Disclosure variant="nested" defaultExpanded title={<span className="flex-1 font-medium text-on-surface">Exclusive Item rules changed</span>}>
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <RuleList title="Before" rules={diff.exclusivityRules.before} />
            <RuleList title="After" rules={diff.exclusivityRules.after} />
          </div>
        </Disclosure>
      )}
      {diff.rulesMarkdown && (
        <Disclosure variant="nested" title={<span className="flex-1 font-medium text-on-surface">Rules text changed</span>}>
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <TextBlock title="Before" text={diff.rulesMarkdown.before} />
            <TextBlock title="After" text={diff.rulesMarkdown.after} />
          </div>
        </Disclosure>
      )}
    </div>
  );
}

function RuleList({ title, rules }: { title: string; rules: ExclusivityRule[] }) {
  return (
    <div>
      <p className="mb-1 font-medium text-on-surface-muted">{title}</p>
      {rules.length === 0 ? <p className="text-on-surface-subtle">None</p> : <ul className="space-y-1">{rules.map((r) => <li key={r.id}>{describeRule(r)}</li>)}</ul>}
    </div>
  );
}

function TextBlock({ title, text }: { title: string; text: string | null }) {
  return (
    <div>
      <p className="mb-1 font-medium text-on-surface-muted">{title}</p>
      <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-md border border-outline bg-background p-2 font-mono">{text || "(none)"}</pre>
    </div>
  );
}
