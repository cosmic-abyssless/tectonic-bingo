import type { RequirementNodeModel } from "../../../headless/types";
import { CheckIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { INK, INK_BODY, INK_SUBTLE, GREEN, ORANGE, RULE } from "./colors";

function rowColor(dim: boolean, submitted: boolean) {
  if (dim) return INK_SUBTLE;
  if (submitted) return INK_BODY;
  return INK;
}

function Check() {
  return <CheckIcon size={12} className="shrink-0" style={{ color: GREEN }} aria-label="complete" />;
}

// A leaf (ITEM or SUM) row — the model already carries dim/submitted/
// complete/progress precomputed (see headless/boardModel.ts's
// buildRequirementTree), so this only renders them.
function LeafOrSumRow({ node }: { node: RequirementNodeModel }) {
  return (
    <li
      className={`flex items-baseline gap-2 text-sm ${node.dim ? "line-through" : ""}`}
      style={{ color: rowColor(node.dim, node.submitted) }}
    >
      <span style={{ color: INK_SUBTLE }}>·</span>
      {node.progress && (
        <span
          className="num text-xs font-medium"
          style={{ color: node.complete ? GREEN : ORANGE }}
        >
          {node.progress.current}/{node.progress.target}
        </span>
      )}
      {node.label}
      {node.complete && <Check />}
    </li>
  );
}

export function RequirementTree({ node, root }: { node: RequirementNodeModel; root?: boolean }) {
  if (node.isLeaf) {
    return (
      <ul className="space-y-1">
        <LeafOrSumRow node={node} />
      </ul>
    );
  }
  return (
    <div className={root ? "" : "ml-2 border-l pl-3"} style={root ? undefined : { borderColor: RULE }}>
      {node.showHeading && (
        <span
          className="inline-flex items-center gap-1 text-xs uppercase tracking-wide"
          style={{ fontFamily: COMIC_FONT, color: node.complete ? GREEN : INK_SUBTLE }}
        >
          {node.label}
          {node.complete && <Check />}
        </span>
      )}
      <ul className="mt-1 space-y-1">
        {node.children.map((child) =>
          child.isLeaf ? (
            <LeafOrSumRow key={child.id} node={child} />
          ) : (
            <li key={child.id}>
              <RequirementTree node={child} />
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
