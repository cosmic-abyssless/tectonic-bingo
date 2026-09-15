import { TooltipTrigger, Tooltip, Focusable } from "react-aria-components";
import type { TaskModel } from "../../../headless/types";
import { Badge } from "../../../core/ui/Card";
import { CheckIcon, LockIcon } from "../../../core/ui/icons";
import { useResolvedColorScheme } from "../../../core/ui/colorScheme";
import { useSlot } from "../../context";
import { COMIC_FONT } from "../font";
import { getColors } from "./colors";

function Check({ color }: { color: string }) {
  return (
    <CheckIcon
      size={12}
      className="shrink-0"
      style={{ color }}
      aria-label="complete"
    />
  );
}

// A task is just a node that's a direct child of its tile's node.
export function TaskPanel({ task }: { task: TaskModel }) {
  const RequirementTree = useSlot("RequirementTree");
  const { INK, INK_BODY, GREEN, BLUE, BLUE_TINT, ORANGE, ORANGE_LINE, PAPER_RAISED } = getColors(useResolvedColorScheme());

  return (
    <div className="p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="text-xl"
            style={{ fontFamily: COMIC_FONT, color: INK }}
          >
            {task.label}
          </span>
          {task.complete && <Check color={GREEN} />}
          {task.isManual && (
            <Badge
              style={{
                borderColor: BLUE,
                color: BLUE,
                backgroundColor: BLUE_TINT,
              }}
            >
              Judged by mods
            </Badge>
          )}
          {task.locked && (
            <TooltipTrigger delay={200}>
              <Focusable>
                <span
                  role="img"
                  aria-label="Locked"
                  tabIndex={0}
                  className="inline-flex"
                  style={{ color: INK_BODY }}
                >
                  <LockIcon size={14} />
                </span>
              </Focusable>
              <Tooltip
                offset={6}
                className="z-30 max-w-56 rounded-md border-2 px-3 py-2 text-xs leading-relaxed"
                style={{
                  borderColor: INK,
                  backgroundColor: PAPER_RAISED,
                  color: INK,
                  boxShadow: `3px 3px 0 ${INK}`,
                }}
              >
                {task.lockedReason ?? "This task depends on a previous task."}
              </Tooltip>
            </TooltipTrigger>
          )}
        </div>
        <span
          className="num shrink-0"
          style={{ fontFamily: COMIC_FONT, color: INK, fontSize: "1.1rem" }}
        >
          {task.points} pts
        </span>
      </div>

      <p className="mb-3 text-sm leading-relaxed" style={{ color: INK_BODY }}>
        {task.description}
      </p>

      {!task.isManual && task.tree && <RequirementTree node={task.tree} root />}

      {!task.isManual && task.allowsPreLoad && (
        <div className="mt-3">
          <Badge style={{ borderColor: INK, color: INK }}>
            Pre-load allowed
          </Badge>
        </div>
      )}

      {task.notes && (
        <p
          className="mt-3 border-l-2 pl-2 text-xs"
          style={{ borderColor: ORANGE_LINE, color: ORANGE }}
        >
          {task.notes}
        </p>
      )}
    </div>
  );
}
