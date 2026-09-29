import type { ReactNode } from "react";
import { useMatch, useNavigate } from "react-router-dom";
import { useAchievementsEligible, useOpenAchievements } from "../core/achievements/AchievementsProvider";
import type { HeaderMenuEntry } from "../core/ui/headerMenu";
import type { BingoHeaderModel } from "./useBingoHeader";

/** What only the board can open from the ☰ menu, each where it applies there. */
export interface BoardMenuActions {
  /** The submissions drawer, with the viewed team's pending count as the badge. */
  submissions?: { badge?: ReactNode; onShow: () => void };
  /** The viewed team's summary (TeamInfoDialog, as the TeamBanner opens it), labelled with the team's name. */
  team?: { name: string; onShow: () => void };
  /** The Rules dialog; shown only when the bingo has rules (or they come later). */
  onShowRules?: () => void;
}

/**
 * The "This Bingo" group of the header's ☰ menu (AppHeader's menuEntries), in order: Submissions, the team, Rules,
 * Stats, Rewind, the Draft or Scouting room, Wrapped and Achievements. Each shows only when it applies, and the page
 * you're on (stats, Rewind, the draft room, Wrapped) shows as current. Achievements come from the page's
 * AchievementsProvider, where there is one.
 */
export function useBingoMenuEntries(slug: string, header: BingoHeaderModel | null, board: BoardMenuActions = {}): HeaderMenuEntry[] {
  const navigate = useNavigate();
  const page = useMatch("/b/:slug/:page")?.params.page;
  const achievementsEligible = useAchievementsEligible();
  const openAchievements = useOpenAchievements();
  if (!header) return [];

  const goTo = (to: string) => () => navigate(`/b/${slug}/${to}`);
  const hasRules = !!header.rulesMarkdown || header.rulesComeLater;
  const entries: HeaderMenuEntry[] = [];
  if (board.submissions) entries.push({ id: "submissions", text: "Submissions", label: "Submissions", badge: board.submissions.badge, onAction: board.submissions.onShow });
  if (board.team) entries.push({ id: "team", text: board.team.name, label: board.team.name, onAction: board.team.onShow });
  if (board.onShowRules && hasRules) entries.push({ id: "rules", text: "Rules", label: "Rules", onAction: board.onShowRules });
  if (header.canViewStats) entries.push({ id: "stats", text: "Stats", label: "Stats", current: page === "stats", onAction: goTo("stats") });
  if (header.canRewind) entries.push({ id: "rewind", text: "Rewind", label: "Rewind", current: page === "rewind", onAction: goTo("rewind") });
  if (header.draftRoom) {
    const label = header.draftRoom === "draft" ? "Draft room" : "Scouting room";
    entries.push({ id: "draft", text: label, label, current: page === "draft", onAction: goTo("draft") });
  }
  if (header.canOpenWrapped) entries.push({ id: "wrapped", text: "Wrapped", label: "Wrapped", current: page === "wrapped", onAction: goTo("wrapped") });
  if (achievementsEligible && openAchievements) entries.push({ id: "achievements", text: "Achievements", label: "Achievements", onAction: openAchievements });
  return entries;
}
