import { useWrappedModel } from "../../../headless";
import { ArrowRightIcon } from "../../../core/ui/icons";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { COMIC_FONT } from "../font";
import { PrintedShade } from "../ui/tones";
import { useComic } from "../ui/useComic";
import { COVER, CoverCaption } from "./coverParts";
import { useBook } from "./bookContext";
import { LETTERED } from "../../lettering";

/**
 * "In this issue": the page after the cover, a contents page listing the viewer's sections with the page each starts on,
 * each a way to jump straight to it. The book adds it; it isn't a section of the Wrapped model.
 */
export function ContentsPage() {
  const wrapped = useWrappedModel();
  const { controller, snapshot } = useBook();
  const { colors } = useComic();
  const entries = wrapped.sections.filter((s) => s.id !== "intro");
  const pageOf = (id: string) => snapshot.pages.find((p) => p.sectionId === id);
  return (
    <WrappedScene steps={1} className="wrapped-contents">
      <Reveal bare step={0} className="w-full">
        <div className="relative flex flex-col gap-3 px-1 pt-1 pb-2">
          <div className="relative border-[3px] px-3 py-2.5" style={{ background: COVER.YELLOW, borderColor: colors.LINE, boxShadow: `4px 4px 0 ${colors.SHADOW}`, transform: "rotate(-1.2deg)" }}>
            <PrintedShade ink={COVER.ORANGE} strength={30} from={30} />
            <div className="relative">
              <p className={`${LETTERED} uppercase leading-none`} style={{ fontFamily: COMIC_FONT, fontSize: 13, letterSpacing: "0.12em", color: COVER.INK }}>
                {wrapped.bingoName}
              </p>
              <h2 className={`${LETTERED} comic-outline-text mt-1 uppercase leading-none`} style={{ fontFamily: COMIC_FONT, fontSize: 46, letterSpacing: "0.02em", color: COVER.TITLE_FILL, ["--comic-title-fill" as string]: COVER.TITLE_FILL, ["--comic-title-stroke" as string]: COVER.INK }}>
                In this issue
              </h2>
            </div>
          </div>
          <p className="px-1 text-[14px]" style={{ color: colors.INK_BODY }}>
            Pick a story to jump straight to it, or just keep turning the pages.
          </p>
          <ol className="flex flex-col gap-2.5">
            {entries.map((s) => {
              const page = pageOf(s.id);
              // The Outro opens on the share cards when the viewer has any, and is only the back cover when not.
              const isBack = s.id === "outro";
              const backLabel = page?.kind === "back" ? "The back cover" : page?.kind === "credits" ? "Credits & back cover" : "Share cards & back cover";
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => controller.goToSection(s.id)}
                    aria-label={`${isBack ? backLabel : s.label}${page?.no ? `, page ${page.no}` : ""}`}
                    className="comic-press comic-lift flex w-full cursor-pointer items-center gap-3 border-[3px] px-3 py-2 text-left"
                    style={{ background: colors.PAPER_RAISED, borderColor: colors.LINE, boxShadow: `3px 3px 0 ${colors.SHADOW}`, color: colors.INK, ["--comic-line" as string]: colors.LINE, ["--comic-shadow" as string]: colors.SHADOW }}
                  >
                    <span
                      className={`${LETTERED} flex h-9 min-w-9 shrink-0 items-center justify-center border-[3px] px-1 text-xl leading-none`}
                      style={{ fontFamily: COMIC_FONT, background: isBack ? COVER.RED : COVER.YELLOW, color: isBack ? COVER.ON_LOUD : COVER.ON_YELLOW, borderColor: colors.LINE }}
                    >
                      {isBack ? "★" : (page?.no ?? "")}
                    </span>
                    <span className={`${LETTERED} min-w-0 flex-1 uppercase leading-none`} style={{ fontFamily: COMIC_FONT, fontSize: 24, letterSpacing: "0.03em" }}>
                      {isBack ? backLabel : s.label}
                    </span>
                    <ArrowRightIcon size={18} />
                  </button>
                </li>
              );
            })}
          </ol>
          <CoverCaption tilt={1} fill={colors.PAPER_RAISED} size={13} style={{ alignSelf: "flex-end", color: colors.INK, borderColor: colors.LINE, boxShadow: `3px 3px 0 ${colors.SHADOW}` }}>
            Scroll, swipe, or press →
          </CoverCaption>
        </div>
      </Reveal>
    </WrappedScene>
  );
}
