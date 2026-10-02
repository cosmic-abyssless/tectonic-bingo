import type { SubmissionFlowModel } from "../../../headless/types";
import { CheckIcon } from "../../../core/ui/icons";
import { CaptionBox } from "../ui/CaptionBox";
import { useComic } from "../ui/useComic";
import { ComicField } from "./ComicField";
import { ComicSegmentedControl } from "../ui/ComicSegmentedControl";

/** Which part? A row of chunky ink tabs; the picked one is yellow. */
export function TaskPicker({ task }: { task: SubmissionFlowModel["task"] }) {
  const { colors } = useComic();
  return (
    <>
      {task.options.length > 1 && (
        <ComicField label="Part" as="div" tutorial="submit-tile">
          <ComicSegmentedControl
            aria-label="Part"
            options={task.options.map((option, i) => ({
              id: option.id,
              label: (picked: boolean) => (
                <>
                  <span
                    className="inline-flex size-5 items-center justify-center border-[2px] text-xs"
                    style={{ borderColor: colors.LINE, background: picked ? colors.LINE : "transparent", color: picked ? colors.PAPER_RAISED : colors.INK_SUBTLE }}
                  >
                    {i + 1}
                  </span>
                  {option.label}
                </>
              ),
            }))}
            value={task.selectedId}
            onChange={task.select}
          />
        </ComicField>
      )}

      {task.autoSelected && task.current && (
        <p className="flex items-center gap-2 text-sm" style={{ color: colors.INK_BODY }}>
          <CheckIcon style={{ color: colors.OK }} />
          Filed under <span className="font-semibold" style={{ color: colors.INK }}>{task.current.label}</span>
        </p>
      )}

      {task.current?.isManual && (
        <CaptionBox tone="blue" title="Judged by a mod">
          <p className="text-sm">This part is judged by a mod. Just send the screenshot as proof.</p>
        </CaptionBox>
      )}
    </>
  );
}
