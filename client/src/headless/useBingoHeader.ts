import { STAGE_LABEL, areRulesHidden, type BingoShellResponse } from "@bingo/shared";
import { useBingo, usePendingCount } from "../api/queries";
import { useAuth } from "../context/AuthContext";

// What a bingo's page header shows, for the pages around the board (the draft room): the same masthead as the board
// page, without loading the board. The board page's own model (useBingoPage) carries the same fields.

export interface BingoHeaderModel {
  name: string;
  stage: BingoShellResponse["bingo"]["stage"];
  /** "Signups open", "Draft", "Live"… */
  stageLabel: string;
  isMod: boolean;
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
  /** A Historical Bingo (CONTEXT.md): the header carries a Historical badge. */
  historical: boolean;
}

/** What the Rules dialog says while the rules are held back (Hide rules, during Board revealed). */
export const RULES_COME_LATER = "The rules will be posted at a later date.";

/**
 * Players see their own team's stats while the bingo is live and everyone's once it's over (the stats endpoint 403s
 * otherwise); mods see them throughout.
 */
export function canViewStats(shell: Pick<BingoShellResponse, "bingo" | "isMod" | "myTeam" | "historical">): boolean {
  if (shell.historical && !shell.historical.submissions) return false;
  return shell.isMod || shell.bingo.stage === "complete" || (shell.bingo.stage === "live" && !!shell.myTeam);
}

/** Rewind (CONTEXT.md) exists only once the bingo is Finished, and for a Historical Bingo only when it recorded Submissions. */
export function canRewind(shell: Pick<BingoShellResponse, "bingo" | "historical">): boolean {
  return shell.bingo.stage === "complete" && (!shell.historical || shell.historical.submissions);
}

/** Null while the bingo is loading. */
export function useBingoHeader(slug: string): BingoHeaderModel | null {
  const { user, devMode } = useAuth();
  const { data: shell } = useBingo(slug);
  const { data: pending } = usePendingCount(slug, !!shell?.isMod);
  if (!shell) return null;
  return {
    name: shell.bingo.name,
    stage: shell.bingo.stage,
    stageLabel: STAGE_LABEL[shell.bingo.stage],
    isMod: shell.isMod,
    canViewStats: canViewStats(shell),
    canRewind: canRewind(shell),
    historical: shell.bingo.historical,
    pendingCount: pending?.count ?? 0,
    rulesMarkdown: shell.bingo.rulesMarkdown ?? "",
    rulesComeLater: !shell.isMod && areRulesHidden(shell.bingo),
    canSeeAllBingos: !!user?.isAdmin || devMode,
  };
}
