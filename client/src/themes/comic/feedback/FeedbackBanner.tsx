import { ArrowRightIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { ComicButton } from "../ui/ComicButton";
import { PrintedShade } from "../ui/tones";
import { useComic } from "../ui/useComic";
import { LETTERED } from "../../lettering";

/**
 * The Board's feedback card in the comic's panel frame (3px ink border, hard shadow), the kicker as a caption tag like
 * the Wrapped banner's, in blue: inviting a Finished Bingo's Player to give feedback until they have, then a link to
 * edit it. Says the answers are anonymous.
 */
export function FeedbackBanner({ responded, onOpen }: { responded: boolean; onOpen: () => void }) {
  const { colors } = useComic();
  return (
    <section
      className="relative mb-4 overflow-hidden border-[3px] p-4 sm:p-5"
      style={{ borderColor: colors.LINE, background: colors.PAPER_RAISED, boxShadow: `4px 4px 0 ${colors.SHADOW}`, color: colors.INK }}
    >
      <PrintedShade ink={colors.BLUE} strength={18} from={25} />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`${LETTERED} inline-block rotate-1 border-2 px-2 py-0.5 text-sm uppercase leading-none`}
            style={{ fontFamily: COMIC_FONT, letterSpacing: "0.06em", background: colors.BLUE, color: colors.ON_LOUD, borderColor: colors.LINE }}
          >
            {responded ? "Thanks!" : "How was it?"}
          </p>
          <h2 className={`${LETTERED} mt-2 text-3xl uppercase leading-none sm:text-4xl`} style={{ fontFamily: COMIC_FONT, letterSpacing: "0.03em" }}>
            {responded ? "Your feedback is in" : "Tell us how the Bingo went"}
          </h2>
          <p className="mt-1.5 text-sm" style={{ color: colors.INK_SUBTLE }}>
            Anonymous: nobody, Moderators and Admins included, can see who gave which answers.
          </p>
        </div>
        <ComicButton variant={responded ? "secondary" : "primary"} onPress={onOpen}>
          {responded ? "Edit your feedback" : "Give feedback"}
          <ArrowRightIcon />
        </ComicButton>
      </div>
    </section>
  );
}
