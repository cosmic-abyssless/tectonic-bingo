import { Fragment, type CSSProperties } from "react";
import type { RequirementNodeModel } from "../../../headless/types";
import { CheckIcon } from "../../../core/ui/icons";
import { ItemIcon } from "../../../core/ui/ItemIcon";
import { WikiItemLink } from "../../../core/ui/WikiItemLink";
import { itemNameOf } from "../../../headless/requirementItems";
import { countsAsLabel } from "../../../core/board/labels";
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

/** "USED ON DT2 ISSUE 1": the team already used this item elsewhere, so it is unavailable here (not done). */
function LockedTag({ text, colors }: { text: string; colors: ComicColors }) {
  return (
    <span className="ml-1.5 text-[10px] uppercase tracking-wider" style={{ color: colors.RED }}>
      {text}
    </span>
  );
}

/** "· counts as 25" after an item that adds more than one to its SUM's total (CONTEXT.md "Counts as"); nothing at 1. */
function CountsAs({ countsAs, colors }: { countsAs: number | undefined; colors: ComicColors }) {
  const label = countsAsLabel(countsAs);
  return label ? (
    <span className="ml-1.5 text-xs" style={{ color: colors.INK_SUBTLE }}>
      · {label}
    </span>
  ) : null;
}

// The line down a nested condition's options, with a branch to each, as the board editor draws it. Drawn per row (and
// through the gaps between rows, which are each row's top padding), so it stops at the last option's branch. The branch
// meets a row's first line: its padding, plus half a box.
const BRANCH = "relative pl-4 pt-1.5 before:absolute before:left-0 before:top-0 before:border-l-2 before:border-[color:var(--tree)]";
const BRANCH_TICK = "after:absolute after:left-0 after:top-4 after:w-3 after:border-t-2 after:border-[color:var(--tree)]";
const branchClass = (last: boolean, tick = true) => `${BRANCH} ${last ? "before:h-4" : "before:bottom-0"} ${tick ? BRANCH_TICK : ""}`;

/**
 * An ITEM, or a SUM over a single item (whose quantity and x/N progress sit on the row). `bare`: a piece of an "any one of"
 * group of Items, which has no box of its own (the group's row has it). `className`: its branch, in a nested condition.
 */
function LeafRow({ node, colors, bare, className }: { node: RequirementNodeModel; colors: ComicColors; bare?: boolean; className?: string }) {
  const iconUrl = node.iconUrl ?? (node.items.length === 1 ? node.items[0]!.iconUrl : null);
  const color = node.dim ? colors.INK_SUBTLE : node.submitted && !node.complete ? colors.WARN : colors.INK_BODY;
  return (
    // A SUM never strikes through: its items can be handed in again (duplicates
    // count), so what's been received is shown as a count instead.
    <li className={`flex items-start gap-2 text-sm leading-snug ${node.dim && !node.progress ? "line-through" : ""} ${className ?? ""}`} style={{ color }}>
      {!bare && <Box done={node.complete} dim={node.dim} colors={colors} />}
      <span className="min-w-0 flex-1">
        <span style={node.lockedBy ? { color: colors.INK_SUBTLE } : undefined}>
          <ItemIcon url={iconUrl} className={`${ICON_CLASS} ${node.dim || node.lockedBy ? "opacity-60" : ""}`} />
          {itemNameOf(node) ? <WikiItemLink name={itemNameOf(node)!} /> : node.label}
          {node.kind === "SUM" && <CountsAs countsAs={node.items[0]?.countsAs} colors={colors} />}
          {node.quantity && (
            <span className="num ml-1.5 text-base leading-snug" style={{ fontFamily: COMIC_FONT }}>
              ×{node.quantity}
            </span>
          )}
          {node.lockedBy && <LockedTag text={node.lockedBy} colors={colors} />}
        </span>
        {node.submitted && !node.complete && !node.dim && (
          <span className="ml-1.5 text-[10px] uppercase tracking-wider" style={{ color: colors.WARN }}>
            submitted
          </span>
        )}
      </span>
      {node.progress && <Progress node={node} colors={colors} />}
    </li>
  );
}

function Progress({ node, colors }: { node: RequirementNodeModel; colors: ComicColors }) {
  return (
    <span className="num shrink-0 text-base leading-none" style={{ fontFamily: COMIC_FONT, color: node.complete ? colors.OK : colors.WARN }}>
      {node.progress!.current}/{node.progress!.target}
    </span>
  );
}

/** A SUM over several items: one row per item with how many have been received, and no box per item, since no single item completes it on its own. */
function SumItemRows({ node, colors }: { node: RequirementNodeModel; colors: ComicColors }) {
  return node.items.map((item) => (
    <li key={item.name} className="text-sm leading-snug" style={{ color: node.dim || item.lockedBy ? colors.INK_SUBTLE : colors.INK_BODY }}>
      <ItemIcon url={item.iconUrl} className={`${ICON_CLASS} ${node.dim || item.lockedBy ? "opacity-60" : ""}`} />
      <WikiItemLink name={item.name} />
      <CountsAs countsAs={item.countsAs} colors={colors} />
      <span className="num ml-1.5 text-base leading-snug" style={{ fontFamily: COMIC_FONT, color: item.count > 0 ? colors.OK : colors.INK_SUBTLE }}>
        ×{item.count}
      </span>
      {item.lockedBy && <LockedTag text={item.lockedBy} colors={colors} />}
    </li>
  ));
}

/** "— OR —" between an ANY's direct options, in the heading font. */
function OrDivider({ dim, colors, className }: { dim: boolean; colors: ComicColors; className?: string }) {
  const color = dim ? colors.INK_SUBTLE : colors.INK;
  return (
    <li role="separator" className={`flex items-center gap-2 text-sm uppercase leading-none tracking-wide ${dim ? "opacity-60" : ""} ${className ?? ""}`} style={{ fontFamily: COMIC_FONT, color }}>
      <span className="h-0.5 w-5" style={{ background: color }} />
      or
      <span className="h-0.5 w-5" style={{ background: color }} />
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
  const headingColor = node.complete ? colors.OK : node.dim ? colors.INK_SUBTLE : colors.INK;
  // The root's options are a plain list; a nested condition's hang off its line, a branch to each (see BRANCH).
  const nested = !root && node.kind !== "SUM";
  const last = node.children.length - 1;
  return (
    <div style={nested ? ({ "--tree": node.complete ? colors.OK : node.dim ? colors.INK_SUBTLE : colors.LINE } as CSSProperties) : undefined}>
      {node.showHeading &&
        (node.itemGroup ? (
          // One option of its parent: a row with its own box, ticked once any piece is in.
          <div className="flex items-start gap-2">
            <Box done={node.complete} dim={node.dim} colors={colors} />
            <span className="mt-0.5 text-base uppercase leading-none tracking-wide" style={{ fontFamily: COMIC_FONT, color: headingColor }}>
              {node.label}
            </span>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-base uppercase leading-none tracking-wide" style={{ fontFamily: COMIC_FONT, color: headingColor }}>
            {node.label}
            {node.progress && (
              <>
                <span aria-hidden>·</span>
                <Progress node={node} colors={colors} />
              </>
            )}
            {node.complete && <CheckIcon size={12} />}
          </span>
        ))}
      <ul className={nested ? "ml-[7px]" : `space-y-1.5 ${node.showHeading ? "mt-1.5" : ""}`}>
        {node.kind === "SUM" ? (
          <SumItemRows node={node} colors={colors} />
        ) : (
          node.children.map((child, i) => (
            <Fragment key={child.id}>
              {i > 0 && node.divider && <OrDivider dim={node.divider.dim} colors={colors} className={nested ? branchClass(false, false) : undefined} />}
              {child.isLeaf ? (
                <LeafRow node={child} colors={colors} bare={node.itemGroup} className={nested ? branchClass(i === last) : undefined} />
              ) : (
                <li className={nested ? branchClass(i === last) : undefined}>
                  <RequirementTree node={child} />
                </li>
              )}
            </Fragment>
          ))
        )}
      </ul>
    </div>
  );
}
