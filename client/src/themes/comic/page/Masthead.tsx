import type { ReactNode } from "react";
import { useBingoMenuEntries, type BingoHeaderModel } from "../../../headless";
import { AppHeader } from "../../../core/ui/AppHeader";
import { ShieldIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { ComicButton } from "../ui/ComicButton";
import { useComic } from "../ui/useComic";
import { comicHeaderProps } from "./headerStyle";

/**
 * The masthead every page of a bingo shares (the board, the draft room): the bingo's name in Bangers, its stage (or
 * time left) in a caption box, the Mod panel for mods, and everything else in the ☰ menu. The board adds its own
 * Submissions, team and Submit.
 */
export function Masthead({
  slug,
  header,
  back,
  status,
  onShowRules,
  submissions,
  team,
  children,
}: {
  slug: string;
  header: BingoHeaderModel;
  /** Where the back arrow goes; by default the list of every bingo, for those who can see it. */
  back?: { to: string; label: string };
  /** What the caption box says, if not the stage (the board's "3 days left"). */
  status?: ReactNode;
  onShowRules: () => void;
  /** The board's submissions drawer, in the ☰ menu with the viewed team's pending count. */
  submissions?: { pending: number; onShow: () => void };
  /** The board's viewed team: its summary, in the ☰ menu under the team's name. */
  team?: { name: string; onShow: () => void };
  /** After the Mod panel (the board's Submit). */
  children?: ReactNode;
}) {
  const { colors } = useComic();
  const menuEntries = useBingoMenuEntries(slug, header, {
    submissions: submissions && { badge: submissions.pending > 0 ? <Counter n={submissions.pending} /> : undefined, onShow: submissions.onShow },
    team,
    onShowRules,
  });

  return (
    <AppHeader
      back={back ?? (header.canSeeAllBingos ? { to: "/", label: "All bingos" } : undefined)}
      title={header.name}
      subtitle={
        <span className="inline-flex items-center border-2 px-1.5 py-px text-xs uppercase leading-none" style={{ fontFamily: COMIC_FONT, letterSpacing: "0.06em", borderColor: colors.LINE, background: colors.PAPER_RAISED, color: colors.INK }}>
          {status ?? header.stageLabel}
        </span>
      }
      menuEntries={menuEntries}
      {...comicHeaderProps()}
    >
      {/* The Mod panel, then (on the board) Submit. */}
      {header.isMod && <ModPanelLink slug={slug} pendingCount={header.pendingCount} />}
      {children}
    </AppHeader>
  );
}

/** The masthead's way into the mod panel, with the pending count: a route link with a shield, only the shield on a phone. */
export function ModPanelLink({ slug, pendingCount }: { slug: string; pendingCount: number }) {
  return (
    <ComicButton size="sm" href={`/b/${slug}/mod`}>
      <ShieldIcon />
      <span className="max-md:sr-only">Mod panel</span>
      {pendingCount > 0 && <Counter n={pendingCount} />}
    </ComicButton>
  );
}

function Counter({ n }: { n: number }) {
  const { colors } = useComic();
  return (
    <span className="num -my-1 inline-flex min-w-5 items-center justify-center rounded-full border-2 px-1 text-xs" style={{ background: colors.YELLOW, color: colors.ON_YELLOW, borderColor: colors.LINE, fontFamily: COMIC_FONT }}>
      {n}
    </span>
  );
}
