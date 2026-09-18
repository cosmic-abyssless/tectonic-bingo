import type { RequirementNodeModel } from "../../../headless/types";
import { CheckIcon } from "../../../core/ui/icons";
import { ItemIcon } from "../../../core/ui/ItemIcon";
import { COMIC_FONT } from "../font";
import { useComic } from "../ui/useComic";
import type { ComicColors } from "./colors";

/** Hand-drawn style checkbox: ink square, green tick when done. */
function Box({ done, dim, colors }: { done: boolean; dim: boolean; colors: ComicColors }) {
  return (
    <span
      aria-hidden
      className="mt-0.5 flex size-4 shrink-0 items-center justify-center border-2"
      style={{ borderColor: dim ? colors.INK_SUBTLE : colors.LINE, background: done ? colors.OK : colors.PAPER_RAISED, color: colors.ON_LOUD, transform: "rotate(-2deg)" }}
    >
      {done && <CheckIcon size={11} />}
    </span>
  );
}

// Inline with the text (so long names still wrap), sized to sit in a text line
// without making the row taller; faded with the row once it's done or not needed.
const ICON_CLASS = "mr-1.5 inline-block -my-1 align-middle";

function LeafRow({ node, colors }: { node: RequirementNodeModel; colors: ComicColors }) {
  const iconUrl = node.iconUrl ?? (node.items.length === 1 ? node.items[0]!.iconUrl : null);
  const color = node.dim ? colors.INK_SUBTLE : node.submitted && !node.complete ? colors.WARN : colors.INK_BODY;
  return (
    <li className={`flex items-start gap-2 text-sm leading-snug ${node.dim ? "line-through" : ""}`} style={{ color }}>
      <Box done={node.complete} dim={node.dim} colors={colors} />
      <span className="min-w-0 flex-1">
        {node.items.length > 1 ? (
          <ul className="list-disc space-y-0.5 pl-4">
            {node.items.map((item) => (
              <li key={item.name}>
                <ItemIcon url={item.iconUrl} className={`${ICON_CLASS} ${node.dim ? "opacity-60" : ""}`} />
                {item.name}
              </li>
            ))}
          </ul>
        ) : (
          <>
            <ItemIcon url={iconUrl} className={`${ICON_CLASS} ${node.dim ? "opacity-60" : ""}`} />
            {node.label}
          </>
        )}
        {node.submitted && !node.complete && !node.dim && (
          <span className="ml-1.5 text-[10px] uppercase tracking-wider" style={{ color: colors.WARN }}>
            submitted
          </span>
        )}
      </span>
      {node.progress && (
        <span className="num shrink-0 text-base leading-none" style={{ fontFamily: COMIC_FONT, color: node.complete ? colors.OK : colors.WARN }}>
          {node.progress.current}/{node.progress.target}
        </span>
      )}
    </li>
  );
}

/** Requirement checklist. Group headings read as "ANY OF" / "ALL OF" style labels. */
export function RequirementTree({ node, root }: { node: RequirementNodeModel; root?: boolean }) {
  const { colors } = useComic();

  if (node.isLeaf) {
    return (
      <ul className="space-y-1.5">
        <LeafRow node={node} colors={colors} />
      </ul>
    );
  }
  return (
    <div className={root ? "" : "ml-1.5 border-l-[3px] pl-3"} style={root ? undefined : { borderColor: node.complete ? colors.OK : colors.LINE }}>
      {node.showHeading && (
        <span className="inline-flex items-center gap-1.5 text-base uppercase leading-none tracking-wide" style={{ fontFamily: COMIC_FONT, color: node.complete ? colors.OK : colors.INK }}>
          {node.label}
          {node.complete && <CheckIcon size={12} />}
        </span>
      )}
      <ul className={`space-y-1.5 ${node.showHeading ? "mt-1.5" : ""}`}>
        {node.children.map((child) =>
          child.isLeaf ? (
            <LeafRow key={child.id} node={child} colors={colors} />
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
