import type { BingoPageModel } from "../../../headless/types";
import { useAuth } from "../../../context/AuthContext";
import { AppHeader } from "../../../core/ui/AppHeader";
import { CountdownTimer } from "../../../core/ui/CountdownTimer";
import { ShieldIcon, UsersIcon } from "../../../core/ui/icons";
import { useSlot } from "../../context";
import { COMIC_FONT } from "../font";
import { ComicButton } from "../ui/ComicButton";
import { useComic } from "../ui/useComic";
import { comicHeaderProps } from "./headerStyle";
import { HeaderMenu, type HeaderMenuEntry } from "./HeaderMenu";

/** Masthead: the issue title in Bangers, stage in a caption box, actions as ink buttons with burst counters. */
export function PageHeader({ page }: { page: BingoPageModel }) {
  const { user } = useAuth();
  const { colors } = useComic();
  const TeamSelector = useSlot("TeamSelector");
  const TeamBadge = useSlot("TeamBadge");

  // The same entries the inline buttons show, for the narrow-screen hamburger.
  const menuEntries: HeaderMenuEntry[] = [
    ...(page.canViewStats ? [{ id: "stats", text: "Stats", label: "Stats", onAction: page.actions.goToStats }] : []),
    ...(page.isMod
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
            badge: page.pendingCount > 0 ? <Counter n={page.pendingCount} /> : undefined,
            onAction: page.actions.goToMod,
          },
        ]
      : []),
    ...(page.bingo.rulesMarkdown ? [{ id: "rules", text: "Rules", label: "Rules", onAction: page.rules.show }] : []),
    ...(page.teamSelector.selectedId
      ? [
          {
            id: "submissions",
            text: "Submissions",
            label: "Submissions",
            badge: page.viewing.pendingSubmissionCount > 0 ? <Counter n={page.viewing.pendingSubmissionCount} /> : undefined,
            onAction: page.drawer.show,
          },
        ]
      : []),
  ];

  return (
    <AppHeader
      back={user?.isAdmin ? { to: "/", label: "All bingos" } : undefined}
      title={page.bingo.name}
      subtitle={
        <span className="inline-flex items-center border-2 px-1.5 py-px text-xs uppercase leading-none" style={{ fontFamily: COMIC_FONT, letterSpacing: "0.06em", borderColor: colors.INK, background: colors.PAPER_RAISED, color: colors.INK }}>
          {page.showEndCountdown && page.bingo.endsAt ? (
            <>
              <CountdownTimer target={page.bingo.endsAt} />
              &nbsp;left
            </>
          ) : (
            page.bingo.stageLabel
          )}
        </span>
      }
      {...comicHeaderProps()}
    >
      {page.isMod && page.teams.length > 0 && (
        <>
          <TeamSelector selector={page.teamSelector} />
          {page.viewing.team && (
            <ComicButton size="sm" aria-label={`${page.viewing.team.name} roster`} className="px-2" onPress={page.teamInfo.show}>
              <UsersIcon />
            </ComicButton>
          )}
        </>
      )}
      {!page.isMod && page.myTeam && <TeamBadge team={page.myTeam} onPress={page.teamInfo.show} />}
      {/* The two route changes are links, grouped right after the team
          selector; everything after them acts on the page and stays a
          button. The mod panel gets an icon and sits well away from Submit
          so it isn't hit by accident. Below `md` the whole group collapses
          into the hamburger; Submit and the team stay put. */}
      <div className="hidden items-center gap-2 md:flex">
        {page.canViewStats && (
          <ComicButton size="sm" href={`/b/${page.slug}/stats`}>
            Stats
          </ComicButton>
        )}
        {page.isMod && (
          <ComicButton size="sm" href={`/b/${page.slug}/mod`}>
            <ShieldIcon />
            Mod panel
            {page.pendingCount > 0 && <Counter n={page.pendingCount} />}
          </ComicButton>
        )}
        {page.bingo.rulesMarkdown && (
          <ComicButton size="sm" variant="ghost" onPress={page.rules.show}>
            Rules
          </ComicButton>
        )}
        {page.teamSelector.selectedId && (
          <ComicButton size="sm" tilt={-1} onPress={page.drawer.show}>
            Submissions
            {page.viewing.pendingSubmissionCount > 0 && <Counter n={page.viewing.pendingSubmissionCount} />}
          </ComicButton>
        )}
      </div>
      <div className="md:hidden">
        <HeaderMenu entries={menuEntries} />
      </div>
      {page.canSubmit && (
        <ComicButton
          size="sm"
          variant="primary"
          tilt={1.5}
          sfx={{ text: "SUBMIT!", size: 130 }}
          onPress={() => {
            page.submit.show();
          }}
        >
          Submit
        </ComicButton>
      )}
    </AppHeader>
  );
}

function Counter({ n }: { n: number }) {
  const { colors } = useComic();
  return (
    <span className="num -my-1 inline-flex min-w-5 items-center justify-center rounded-full border-2 px-1 text-xs" style={{ background: colors.YELLOW, color: colors.INK, borderColor: colors.INK, fontFamily: COMIC_FONT }}>
      {n}
    </span>
  );
}
