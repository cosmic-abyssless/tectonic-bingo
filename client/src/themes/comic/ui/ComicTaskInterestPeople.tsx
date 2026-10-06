import { TaskInterestPeopleView, type TaskInterestPeopleProps, type TaskInterestSkin } from "../../../core/ui/TaskInterestPeople";
import { COMIC_FONT } from "../font";
import { LETTERED } from "../../lettering";
import { useComic } from "./useComic";

// Who has a hand up, in ink and paper from the palette of the page it sits on: inked circles whose ring is the page's
// paper (so the overlaps read as cut-outs), a lettered "+N", and the list in a caption box with the hard offset shadow.
export function ComicTaskInterestPeople(props: TaskInterestPeopleProps) {
  const { colors } = useComic();
  const skin: TaskInterestSkin = {
    empty: { className: "text-xs italic", style: { color: colors.INK_SUBTLE } },
    trigger: { className: "rounded-full transition-transform hover:-translate-y-0.5 active:translate-y-0" },
    avatar: { className: "border-2", style: { borderColor: colors.LINE, background: colors.PAPER_RAISED, boxShadow: `0 0 0 2px ${colors.PAPER}` } },
    more: {
      className: `${LETTERED} border-2`,
      style: { borderColor: colors.LINE, background: colors.PAPER_RAISED, color: colors.INK, boxShadow: `0 0 0 2px ${colors.PAPER}`, fontFamily: COMIC_FONT },
    },
    popover: { className: "rounded-sm border-[3px]", style: { borderColor: colors.LINE, background: colors.PAPER_RAISED, color: colors.INK_BODY, boxShadow: `4px 4px 0 ${colors.SHADOW}` } },
    heading: { className: `${LETTERED} border-b-2 uppercase tracking-wider`, style: { borderColor: colors.LINE, color: colors.INK, fontFamily: COMIC_FONT } },
  };
  return <TaskInterestPeopleView {...props} skin={skin} />;
}
