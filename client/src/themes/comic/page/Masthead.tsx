import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { BingoHeaderModel } from "../../../headless";
import { AppHeader } from "../../../core/ui/AppHeader";
import { ShieldIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { ComicButton } from "../ui/ComicButton";
import { useComic } from "../ui/useComic";
import { comicHeaderProps } from "./headerStyle";
import { HeaderMenu, type HeaderMenuEntry } from "./HeaderMenu";

/**
 * The masthead every page of a bingo shares (the board, the draft room): the bingo's name in Bangers, its stage (or
 * time left) in a caption box, and the page links as ink buttons, collapsing into a hamburger below md. The board adds
 * its own Submissions and Submit.
 */
export function Masthead({
  slug,
  header,
  back,
  status,
  onShowRules,
  submissions,
  menuItems,
  extraMenuEntries = [],
  children,
}: {
  slug: string;
  header: BingoHeaderModel;
  /** Where the back arrow goes; by default the list of every bingo, for those who can see it. */
  back?: { to: string; label: string };
  /** What the caption box says, if not the stage (the board's "3 days left"). */
  status?: ReactNode;
  onShowRules: () => void;
  /** The board's submissions drawer: its button, with the viewed team's pending count. */
  submissions?: { pending: number; onShow: () => void };
  /** Extra items for the avatar menu (AppHeader's own account menu), e.g. Achievements. */
  menuItems?: ReactNode;
  /** Extra entries appended to the narrow-screen hamburger, after the built-in ones. */
  extraMenuEntries?: HeaderMenuEntry[];
  /** After the page links (the board's Submit). */
  children?: ReactNode;
}) {
  const { colors } = useComic();
  const navigate = useNavigate();
  const hasRules = !!header.rulesMarkdown;

  // The same entries the inline buttons show, for the narrow-screen hamburger.
  const menuEntries: HeaderMenuEntry[] = [
    ...(header.canViewStats ? [{ id: "stats", text: "Stats", label: "Stats", onAction: () => navigate(`/b/${slug}/stats`) }] : []),
    ...(header.isMod
      ? [
          {
            id: "mod",
            text: "Mod panel",
            label: (
              <>
                <ShieldIcon />
                Mod panel
              </>
            ),
            badge: header.pendingCount > 0 ? <Counter n={header.pendingCount} /> : undefined,
            onAction: () => navigate(`/b/${slug}/mod`),
          },
        ]
      : []),
    ...(hasRules ? [{ id: "rules", text: "Rules", label: "Rules", onAction: onShowRules }] : []),
    ...(submissions
      ? [
          {
            id: "submissions",
            text: "Submissions",
            label: "Submissions",
            badge: submissions.pending > 0 ? <Counter n={submissions.pending} /> : undefined,
            onAction: submissions.onShow,
          },
        ]
      : []),
    ...extraMenuEntries,
  ];

  return (
    <AppHeader
      back={back ?? (header.canSeeAllBingos ? { to: "/", label: "All bingos" } : undefined)}
      title={header.name}
      subtitle={
        <span className="inline-flex items-center border-2 px-1.5 py-px text-xs uppercase leading-none" style={{ fontFamily: COMIC_FONT, letterSpacing: "0.06em", borderColor: colors.LINE, background: colors.PAPER_RAISED, color: colors.INK }}>
          {status ?? header.stageLabel}
        </span>
      }
      // Top-right on a phone, beside the user icon (AppHeader lays that out).
      mobileMenu={
        <div className="md:hidden">
          <HeaderMenu entries={menuEntries} />
        </div>
      }
      menuItems={menuItems}
      {...comicHeaderProps()}
    >
      {/* The two route changes are links; everything after them acts on the page and stays a button. The mod panel
          gets an icon and sits well away from Submit so it isn't hit by accident. Below `md` the whole group collapses
          into the hamburger. */}
      <div className="hidden items-center gap-2 md:flex">
        {header.canViewStats && (
          <ComicButton size="sm" href={`/b/${slug}/stats`}>
            Stats
          </ComicButton>
        )}
        {header.isMod && (
          <ComicButton size="sm" href={`/b/${slug}/mod`}>
            <ShieldIcon />
            Mod panel
            {header.pendingCount > 0 && <Counter n={header.pendingCount} />}
          </ComicButton>
        )}
        {hasRules && (
          <ComicButton size="sm" tilt={1} onPress={onShowRules}>
            Rules
          </ComicButton>
        )}
        {submissions && (
          <ComicButton size="sm" tilt={-1} onPress={submissions.onShow}>
            Submissions
            {submissions.pending > 0 && <Counter n={submissions.pending} />}
          </ComicButton>
        )}
      </div>
      {children}
    </AppHeader>
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
