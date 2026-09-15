import type { RequirementNodeModel } from "../../../headless/types";
import { CheckIcon } from "../../../core/ui/icons";
import { useResolvedColorScheme } from "../../../core/ui/colorScheme";
import { COMIC_FONT } from "../font";
import { getColors, type ComicColors } from "./colors";

function rowColor(colors: ComicColors, dim: boolean, submitted: boolean) {
  if (dim) return colors.INK_SUBTLE;
  if (submitted) return colors.INK_BODY;
  return colors.INK;
}

function Check({ color }: { color: string }) {
  return <CheckIcon size={12} className="shrink-0" style={{ color }} aria-label="complete" />;
}

// A leaf (ITEM or SUM) row — the model already carries dim/submitted/
// complete/progress precomputed (see headless/boardModel.ts's
// buildRequirementTree), so this only renders them.
function LeafOrSumRow({ node, colors }: { node: RequirementNodeModel; colors: ComicColors }) {
  return (
    <li
      className={`flex items-baseline gap-2 text-sm ${node.dim ? "line-through" : ""}`}
      style={{ color: rowColor(colors, node.dim, node.submitted) }}
    >
      <span style={{ color: colors.INK_SUBTLE }}>·</span>
      {node.progress && (
        <span
          className="num text-xs font-medium"
          style={{ color: node.complete ? colors.GREEN : colors.ORANGE }}
        >
          {node.progress.current}/{node.progress.target}
        </span>
      )}
      {node.label}
      {node.complete && <Check color={colors.GREEN} />}
    </li>
  );
}

export function RequirementTree({ node, root }: { node: RequirementNodeModel; root?: boolean }) {
  const colors = getColors(useResolvedColorScheme());

  if (node.isLeaf) {
    return (
      <ul className="space-y-1">
        <LeafOrSumRow node={node} colors={colors} />
      </ul>
    );
  }
  return (
    <div className={root ? "" : "ml-2 border-l pl-3"} style={root ? undefined : { borderColor: colors.RULE }}>
      {node.showHeading && (
        <span
          className="inline-flex items-center gap-1 text-xs uppercase tracking-wide"
          style={{ fontFamily: COMIC_FONT, color: node.complete ? colors.GREEN : colors.INK_SUBTLE }}
        >
          {node.label}
          {node.complete && <Check color={colors.GREEN} />}
        </span>
      )}
      <ul className="mt-1 space-y-1">
        {node.children.map((child) =>
          child.isLeaf ? (
            <LeafOrSumRow key={child.id} node={child} colors={colors} />
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
