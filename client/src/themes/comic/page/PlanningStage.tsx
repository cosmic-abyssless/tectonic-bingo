import { COMIC_FONT } from "../font";
import { Stamp } from "../ui/Stamp";
import { useComic } from "../ui/useComic";

/**
 * Before signups open, and once they've closed until the draft: nothing to do yet, so a charcoal panel with the news
 * stamped on it, like the signup page's "can't sign up" panel.
 */
export function PlanningStage({ stage }: { stage: "planning" | "captains" }) {
  const { colors } = useComic();
  const planning = stage === "planning";
  return (
    <section
      className="mx-auto flex max-w-lg flex-col items-center gap-3 border-[3px] px-5 py-8 text-center"
      style={{ background: colors.PAPER, borderColor: colors.LINE, boxShadow: `4px 4px 0 ${colors.LINE}` }}
    >
      <Stamp kind="custom" rotate={-6} size="md">
        {planning ? "Coming soon" : "Closed"}
      </Stamp>
      <h2 className="mt-2 text-3xl uppercase leading-none" style={{ fontFamily: COMIC_FONT, letterSpacing: "0.03em", color: colors.INK }}>
        {planning ? "Signups haven't opened yet" : "Signups are closed"}
      </h2>
      <p className="max-w-md text-sm" style={{ color: colors.INK_BODY }}>
        {planning ? "Check back once the mods open signups." : "The roster is final. The draft comes next."}
      </p>
    </section>
  );
}
