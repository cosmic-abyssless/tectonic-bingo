import { ArrowRightIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { ComicButton } from "../ui/ComicButton";
import { PrintedShade } from "../ui/tones";
import { useComic } from "../ui/useComic";
import { LETTERED } from "../../lettering";

/**
 * The Board's "Your Bingo Wrapped" banner, framed like the board's other panels (3px ink border, hard shadow) with
 * the kicker as a yellow caption tag, and a printed shading in the same yellow. Only the banner: the Wrapped page
 * itself is themed separately (#233).
 */
export function WrappedBanner({ preview, onOpen }: { preview: boolean; onOpen: () => void }) {
  const { colors } = useComic();
  return (
    <section
      className="relative mb-4 overflow-hidden border-[3px] p-4 sm:p-5"
      style={{ borderColor: colors.LINE, background: colors.PAPER_RAISED, boxShadow: `4px 4px 0 ${colors.SHADOW}`, color: colors.INK }}
    >
      <PrintedShade ink={colors.YELLOW} strength={22} from={25} />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`${LETTERED} inline-block -rotate-2 border-2 px-2 py-0.5 text-sm uppercase leading-none`}
            style={{ fontFamily: COMIC_FONT, letterSpacing: "0.06em", background: colors.YELLOW, color: colors.ON_YELLOW, borderColor: colors.LINE }}
          >
            {preview ? "Wrapped preview" : "It's here!"}
          </p>
          <h2 className={`${LETTERED} mt-2 text-3xl uppercase leading-none sm:text-4xl`} style={{ fontFamily: COMIC_FONT, letterSpacing: "0.03em" }}>
            Your Bingo Wrapped
          </h2>
          {preview && (
            <p className="mt-1.5 text-sm" style={{ color: colors.INK_SUBTLE }}>
              Only Moderators can see it until it's published.
            </p>
          )}
        </div>
        <ComicButton variant="primary" onPress={onOpen}>
          {preview ? "Preview Wrapped" : "Open Wrapped"}
          <ArrowRightIcon />
        </ComicButton>
      </div>
    </section>
  );
}
