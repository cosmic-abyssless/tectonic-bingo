import { ReactionBarView, type ReactionBarProps, type ReactionSkin } from "../../../core/submissions/ReactionBar";
import { useComic } from "./useComic";

// The reactions in ink and paper, from the palette of wherever they sit (a card in the drawer, or a page of the tile's
// book, which stays paper in dark mode too): square chips with the hard offset shadow, blue for the viewer's own (not
// yellow: the fire and the party popper disappear into it).
export function ComicReactionBar(props: ReactionBarProps) {
  const { colors } = useComic();
  const skin: ReactionSkin = {
    chip: (mine) => ({
      className: "rounded-sm border-2",
      style: { borderColor: mine ? colors.BLUE : colors.LINE, background: mine ? colors.BLUE_TINT : colors.PAPER, color: colors.INK, boxShadow: `2px 2px 0 ${colors.LINE}` },
    }),
    add: { className: "rounded-sm border-2 border-dashed hover:brightness-90", style: { borderColor: colors.INK_SUBTLE, color: colors.INK_BODY } },
    popover: { className: "rounded-sm border-[3px]", style: { borderColor: colors.LINE, background: colors.PAPER_RAISED, boxShadow: `4px 4px 0 ${colors.LINE}` } },
    option: (mine) => ({ className: "rounded-sm", style: mine ? { background: colors.BLUE_TINT } : undefined }),
  };
  return <ReactionBarView {...props} skin={skin} />;
}
