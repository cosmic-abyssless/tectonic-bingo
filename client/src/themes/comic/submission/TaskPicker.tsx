import type { SubmissionFlowModel } from "../../../headless/types";
import { CheckIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { CaptionBox } from "../ui/CaptionBox";
import { useComic } from "../ui/useComic";
import { ComicField } from "./ComicField";

/** Which part? A row of chunky ink tabs; the picked one is yellow. */
export function TaskPicker({ task }: { task: SubmissionFlowModel["task"] }) {
  const { colors } = useComic();
  return (
    <>
      {task.options.length > 1 && (
        <ComicField label="Part" as="div">
          <div className="flex flex-wrap gap-2">
            {task.options.map((option, i) => {
              const active = task.selectedId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => task.select(option.id)}
                  aria-pressed={active}
                  className="comic-press flex min-w-24 flex-1 items-center justify-center gap-2 border-[3px] px-3 py-1.5 text-lg uppercase leading-none tracking-wide"
                  style={{
                    fontFamily: COMIC_FONT,
                    borderColor: colors.LINE,
                    background: active ? colors.YELLOW : colors.PAPER_RAISED,
                    color: active ? colors.ON_YELLOW : colors.INK_SUBTLE,
                    boxShadow: active ? `3px 3px 0 ${colors.LINE}` : "none",
                    transform: active ? undefined : "translate(2px,2px)",
                  }}
                >
                  <span
                    className="inline-flex size-5 items-center justify-center border-[2px] text-xs"
                    style={{ borderColor: colors.LINE, background: active ? colors.LINE : "transparent", color: active ? colors.PAPER_RAISED : colors.INK_SUBTLE }}
                  >
                    {i + 1}
                  </span>
                  {option.label}
                </button>
              );
            })}
          </div>
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
