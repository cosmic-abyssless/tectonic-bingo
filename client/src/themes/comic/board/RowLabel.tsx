import type { CategoryModel } from "../../../headless/types";
import { COMIC_FONT } from "../font";
import { useComic } from "../ui/useComic";
import { LETTERED } from "../../lettering";

/**
 * A board row's category, as a vertical tab framed like the board's other panels (3px ink border, hard shadow). The
 * category's colour is a stripe on the outer edge, as the team banner carries its team's, rather than the lettering:
 * a category colour is picked freely and needn't read as text on the paper.
 */
export function RowLabel({ category }: { category: CategoryModel | null }) {
  const { colors } = useComic();
  // Rotated 180°, so the box's right edge is the one facing out, on the left.
  const stripe = category?.color ? `inset -5px 0 0 ${category.color}, ` : "";
  return (
    <div
      className={`${LETTERED} mr-1 flex items-center justify-center border-[3px] px-1 text-sm uppercase leading-none`}
      style={{
        writingMode: "vertical-lr",
        transform: "rotate(180deg)",
        fontFamily: COMIC_FONT,
        letterSpacing: "0.08em",
        background: colors.PAPER_RAISED,
        color: colors.INK,
        borderColor: colors.LINE,
        // Rotated too, so a -3px offset lands down and to the right like every other hard shadow.
        boxShadow: `${stripe}-3px -3px 0 ${colors.SHADOW}`,
      }}
    >
      {category?.label ?? ""}
    </div>
  );
}
