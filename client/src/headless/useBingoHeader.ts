import { STAGE_LABEL, areRulesHidden, type BingoShellResponse } from "@bingo/shared";
import { useBingo, useDraftState, usePendingCount } from "../api/queries";
import { useAuth } from "../context/AuthContext";
import { useBingoCan, useSiteCan } from "./permissions";
import type { CanCheck } from "./permissionCheck";

// What a bingo's page header shows, for the pages around the board (the draft room, stats, Rewind, Wrapped): the same
// header and ☰ menu as the board page, without loading the board. The board page's own model (useBingoPage) carries
// the same fields.

export interface BingoHeaderModel {
  name: string;
  stage: BingoShellResponse["bingo"]["stage"];
  /** "Signups open", "Draft", "Live"… */
  stageLabel: string;
  /** The viewer may open the mod panel (moderate_bingo). */
  canModerate: boolean;
  canViewStats: boolean;
  /** Rewind (CONTEXT.md) exists only once the bingo is Finished (see canRewind). */
  canRewind: boolean;
  /** Submissions waiting for a mod (mods only; 0 otherwise). */
  pendingCount: number;
  /** The bingo's rules, or "" when it has none (then there's no Rules button, unless rulesComeLater). */
  rulesMarkdown: string;
  /** Hide rules is holding the rules back from this viewer for now: the Rules button stays, and says they come later (RULES_COME_LATER). */
  rulesComeLater: boolean;
  /** A site admin (or a dev-mode session) gets a way back to the list of every bingo. */
  canSeeAllBingos: boolean;
  /**
   * The draft room, when there's a way into it: "draft" in the Draft stage once the room lets this viewer in (the
   * board's banners), or for a Historical Bingo that recorded its Draft (read-only); "scouting" while they may scout
   * (canScout).
   */
  draftRoom: "draft" | "scouting" | null;
  /**
   * Wrapped (CONTEXT.md) can be opened: published, or a Moderator's preview; never for a Historical Bingo. Same as the
   * board's wrapped.canOpen.
   */
  canOpenWrapped: boolean;
  /** The viewer plays on a team: away from the board, the ☰ menu's Submissions and Team overview open theirs there. */
  hasTeam: boolean;
  /** The Bingo has Team boards, so Submissions to show: all but a Historical Bingo that recorded no Tasks. */
  hasTeamBoards: boolean;
  /** A Historical Bingo (CONTEXT.md): the header carries a Historical badge. */
  historical: boolean;
}

/** What the Rules dialog says while the rules are held back (Hide rules, during Board revealed). */
export const RULES_COME_LATER = "The rules will be posted at a later date.";

/**
 * Who sees every team's stats (view_other_teams: mods, and everyone once it's over), and players their own team's while
 * the bingo is live (view_team_stats), as the stats endpoint answers. Before Live there's nothing to show, so nobody
 * gets the way in.
 */
export function canViewStats(shell: Pick<BingoShellResponse, "bingo" | "myTeam" | "historical">, can: CanCheck): boolean {
  if (shell.historical && !shell.historical.submissions) return false;
  if (shell.bingo.stage !== "live" && shell.bingo.stage !== "complete") return false;
  return can("view_other_teams").allowed || (can("view_team_stats").allowed && !!shell.myTeam);
}

/**
 * Scouting (CONTEXT.md): the draft room before the Draft stage (view_draft_room). Captains get picked while signups are
 * open (#39), so leads (and mods) scout ahead; once Signups are closed every Player can look through them too.
 */
export function canScout(shell: Pick<BingoShellResponse, "bingo">, can: CanCheck): boolean {
  const { stage } = shell.bingo;
  return (stage === "signup" || stage === "captains") && can("view_draft_room").allowed;
}

/** Rewind (CONTEXT.md) exists only once the bingo is Finished, and for a Historical Bingo only when it recorded Submissions. */
export function canRewind(shell: Pick<BingoShellResponse, "bingo" | "historical">): boolean {
  return shell.bingo.stage === "complete" && (!shell.historical || shell.historical.submissions);
}

/** Null while the bingo is loading. */
export function useBingoHeader(slug: string): BingoHeaderModel | null {
  const { devMode } = useAuth();
  const { data: shell } = useBingo(slug);
  const can = useBingoCan(slug);
  const canModerate = can("moderate_bingo").allowed;
  const siteAdmin = useSiteCan("administer_site").allowed;
  const { data: pending } = usePendingCount(slug, canModerate);
  // The same query the board asks in the Draft stage: having draft state at all means the room lets this viewer in.
  const { data: draftState } = useDraftState(shell?.bingo.stage === "draft" && shell.viewer.canSee ? slug : undefined);
  if (!shell) return null;
  return {
    name: shell.bingo.name,
    stage: shell.bingo.stage,
    stageLabel: STAGE_LABEL[shell.bingo.stage],
    canModerate,
    canViewStats: canViewStats(shell, can),
    canRewind: canRewind(shell),
    historical: shell.bingo.historical,
    pendingCount: pending?.count ?? 0,
    rulesMarkdown: shell.bingo.rulesMarkdown ?? "",
    rulesComeLater: !can("view_hidden_board").allowed && areRulesHidden(shell.bingo),
    canSeeAllBingos: siteAdmin || devMode,
    draftRoom: shell.historical?.draft ? "draft" : shell.bingo.stage === "draft" ? (draftState ? "draft" : null) : canScout(shell, can) ? "scouting" : null,
    canOpenWrapped: shell.bingo.stage === "complete" && !shell.bingo.historical && (shell.wrappedPublished || can("view_wrapped_preview").allowed),
    hasTeam: !!shell.myTeam,
    hasTeamBoards: !shell.historical || shell.historical.tasks,
  };
}
