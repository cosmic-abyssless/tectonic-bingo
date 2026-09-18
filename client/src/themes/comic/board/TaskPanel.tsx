import { TooltipTrigger, Tooltip, Focusable } from "react-aria-components";
import type { TaskModel } from "../../../headless/types";
import { CheckIcon, LockIcon } from "../../../core/ui/icons";
import { useSlot } from "../../context";
import { COMIC_FONT } from "../font";
import { CaptionBox, InkTag } from "../ui/CaptionBox";
import { Stamp } from "../ui/Stamp";
import { useComic } from "../ui/useComic";

/**
 * One task ("part") of an issue, laid out like a story page: a big title,
 * the brief in body copy, the requirement checklist, and a yellow caption
 * for notes. Renders inside a BookPage in the tile modal.
 */
export function TaskPanel({ task }: { task: TaskModel }) {
  const RequirementTree = useSlot("RequirementTree");
  const { colors } = useComic();

  const statusStamp = task.complete ? "approved" : task.status === "pending_approval" ? "pending" : task.locked ? "locked" : null;

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap items-center gap-2 pr-6">
        <h3 className="text-3xl uppercase leading-none tracking-wide" style={{ fontFamily: COMIC_FONT, color: colors.INK }}>
          {task.label}
        </h3>
        {task.complete && <CheckIcon size={18} style={{ color: colors.OK }} aria-label="complete" />}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <InkTag fill={colors.YELLOW}>
          <span className="num">{task.points} pts</span>
        </InkTag>
        {task.isManual && (
          <InkTag color="#fffaf0" fill={colors.BLUE}>
            Judged by mods
          </InkTag>
        )}
        {!task.isManual && task.allowsPreLoad && <InkTag>Pre-load allowed</InkTag>}
        {task.locked && (
          <TooltipTrigger delay={200}>
            <Focusable>
              <span role="img" aria-label="Locked" tabIndex={0} className="inline-flex">
                <InkTag color={colors.INK_BODY}>
                  <LockIcon size={12} /> Locked
                </InkTag>
              </span>
            </Focusable>
            <Tooltip
              offset={6}
              className="z-[80] max-w-56 border-[3px] px-3 py-2 text-xs leading-relaxed"
              style={{ borderColor: colors.INK, backgroundColor: colors.PAPER_RAISED, color: colors.INK, boxShadow: `3px 3px 0 ${colors.INK}` }}
            >
              {task.lockedReason ?? "This part depends on a previous part."}
            </Tooltip>
          </TooltipTrigger>
        )}
        {statusStamp && <Stamp kind={statusStamp} size="sm" rotate={-6} className="ml-auto" />}
      </div>

      {task.description && (
        <p className="mb-4 text-[15px] leading-relaxed first-letter:float-left first-letter:mr-1 first-letter:font-[Bangers] first-letter:text-[1.9em] first-letter:leading-[0.85]" style={{ color: colors.INK_BODY }}>
          {task.description}
        </p>
      )}

      {!task.isManual && task.tree && (
        <CaptionBox tone="paper" title="Checklist">
          <RequirementTree node={task.tree} root />
        </CaptionBox>
      )}

      {task.notes && (
        <CaptionBox tone="yellow" title="Editor's note" tilt={-0.6} className="mt-4">
          <p className="text-sm leading-relaxed" style={{ color: colors.INK_BODY }}>
            {task.notes}
          </p>
        </CaptionBox>
      )}
    </div>
  );
}
