import type { ReactNode } from "react";
import { useMatch, useNavigate } from "react-router-dom";
import { useAchievementsEligible, useOpenAchievements } from "../core/achievements/AchievementsProvider";
import type { HeaderMenuEntry } from "../core/ui/headerMenu";
import type { BingoHeaderModel } from "./useBingoHeader";
import { useTutorial } from "./useTutorial";

/** What the board opens in place from the ☰ menu, each where it applies there. */
export interface BoardMenuActions {
  /** The submissions drawer, with the viewed team's pending count as the badge. */
  submissions?: { badge?: ReactNode; onShow: () => void };
  /** The viewed team's summary (TeamInfoDialog, as the TeamBanner opens it), as "Team overview". */
  team?: { onShow: () => void };
  /** The Rules dialog; shown only when the bingo has rules (or they come later). */
  onShowRules?: () => void;
}

/**
 * The "This Bingo" group of the header's ☰ menu (AppHeader's menuEntries), in order: the Board (the way back to it, the
 * ☰ having taken the back arrow's place), Submissions, the team, Rules,
 * Stats, Rewind, the Draft or Scouting room, Wrapped, Achievements and the Tutorial. Each shows only when it applies, and the page
 * you're on (stats, Rewind, the draft room, Wrapped) shows as current. Achievements come from the page's
 * AchievementsProvider, where there is one.
 *
 * Away from the board the menu lists the same things: Submissions, Team overview and Rules (unless the page has its own
 * Rules dialog) go to the board and open there (`?open=`, which BingoPageProvider reads). Submissions and Team overview
 * need a team to open, so away from the board they're for Players on one; a Moderator picks a team on the board first.
 * The Tutorial replays on the board, while Live, for anyone looking at a Team's Board there; away from it, for Players.
 */
export function useBingoMenuEntries(slug: string, header: BingoHeaderModel | null, board: BoardMenuActions = {}): HeaderMenuEntry[] {
  const navigate = useNavigate();
  const page = useMatch("/b/:slug/:page")?.params.page;
  const onBoard = !!useMatch("/b/:slug");
  const achievementsEligible = useAchievementsEligible();
  const openAchievements = useOpenAchievements();
  const tutorial = useTutorial();
  if (!header) return [];

  const goTo = (to: string) => () => navigate(`/b/${slug}/${to}`);
  const openOnBoard = (open: "submissions" | "team" | "rules" | "tutorial") => () => navigate(`/b/${slug}?open=${open}`);
  const hasRules = !!header.rulesMarkdown || header.rulesComeLater;
  const showSubmissions = board.submissions?.onShow ?? (!onBoard && header.hasTeam && header.hasTeamBoards ? openOnBoard("submissions") : undefined);
  const showTeam = board.team?.onShow ?? (!onBoard && header.hasTeam ? openOnBoard("team") : undefined);
  const showRules = board.onShowRules ?? (!onBoard ? openOnBoard("rules") : undefined);
  const replayTutorial = onBoard ? (tutorial?.canReplay ? tutorial.start : undefined) : header.stage === "live" && header.hasTeam && header.hasTeamBoards ? openOnBoard("tutorial") : undefined;
  const entries: HeaderMenuEntry[] = [];
  // In the Draft stage the board sends everyone who can get into the Draft room straight back to it.
  if (!(header.stage === "draft" && header.draftRoom === "draft")) entries.push({ id: "board", text: "Board", label: "Board", wikiIcon: "Teleport to House icon (mobile)", current: onBoard, onAction: () => navigate(`/b/${slug}`) });
  if (showSubmissions) entries.push({ id: "submissions", text: "Submissions", label: "Submissions", wikiIcon: "Inventory", badge: board.submissions?.badge, onAction: showSubmissions, tutorial: "menu-submissions" });
  if (showTeam) entries.push({ id: "team", text: "Team overview", label: "Team overview", wikiIcon: "Chat-channel", onAction: showTeam });
  if (showRules && hasRules) entries.push({ id: "rules", text: "Rules", label: "Rules", wikiIcon: "Book of Knowledge", onAction: showRules, tutorial: "menu-rules" });
  if (header.canViewStats) entries.push({ id: "stats", text: "Stats", label: "Stats", wikiIcon: "Skills icon", current: page === "stats", onAction: goTo("stats"), tutorial: "menu-stats" });
  if (header.canRewind) entries.push({ id: "rewind", text: "Rewind", label: "Rewind", wikiIcon: "Agility icon", current: page === "rewind", onAction: goTo("rewind") });
  if (header.draftRoom) {
    const label = header.draftRoom === "draft" ? "Draft room" : "Scouting room";
    entries.push({ id: "draft", text: label, label, wikiIcon: "Spyglass", current: page === "draft", onAction: goTo("draft") });
  }
  if (header.canOpenWrapped) entries.push({ id: "wrapped", text: "Wrapped", label: "Wrapped", wikiIcon: "Present", current: page === "wrapped", onAction: goTo("wrapped") });
  // Nothing can be unlocked before Live, so there's nothing to look at until then.
  const achievementsStarted = header.stage === "live" || header.stage === "complete";
  if (achievementsEligible && openAchievements && achievementsStarted) entries.push({ id: "achievements", text: "Achievements", label: "Achievements", wikiIcon: "Achievement Diaries icon", onAction: openAchievements });
  if (replayTutorial) entries.push({ id: "tutorial", text: "Tutorial", label: "Tutorial", wikiIcon: "Quest point icon", onAction: replayTutorial, tutorial: "menu-tutorial" });
  return entries;
}
