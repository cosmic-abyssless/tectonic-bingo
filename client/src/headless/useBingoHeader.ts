import { STAGE_LABEL, type BingoShellResponse } from "@bingo/shared";
import { useBingo, usePendingCount } from "../api/queries";
import { useAuth } from "../context/AuthContext";

// What a bingo's page header shows, for the pages around the board (the draft room): the same masthead as the board
// page, without loading the board. The board page's own model (useBingoPage) carries the same fields.

export interface BingoHeaderModel {
  name: string;
  /** "Signups open", "Draft", "Live"… */
  stageLabel: string;
  isMod: boolean;
  canViewStats: boolean;
  /** Submissions waiting for a mod (mods only; 0 otherwise). */
  pendingCount: number;
  /** The bingo's rules, or "" when it has none (then there's no Rules button). */
  rulesMarkdown: string;
  /** A site admin (or a dev-mode session) gets a way back to the list of every bingo. */
  canSeeAllBingos: boolean;
}

/**
 * Players see their own team's stats while the bingo is live and everyone's once it's over (the stats endpoint 403s
 * otherwise); mods see them throughout.
 */
export function canViewStats(shell: Pick<BingoShellResponse, "bingo" | "isMod" | "myTeam">): boolean {
  return shell.isMod || shell.bingo.stage === "complete" || (shell.bingo.stage === "live" && !!shell.myTeam);
}

/** Null while the bingo is loading. */
export function useBingoHeader(slug: string): BingoHeaderModel | null {
  const { user, devMode } = useAuth();
  const { data: shell } = useBingo(slug);
  const { data: pending } = usePendingCount(slug, !!shell?.isMod);
  if (!shell) return null;
  return {
    name: shell.bingo.name,
    stageLabel: STAGE_LABEL[shell.bingo.stage],
    isMod: shell.isMod,
    canViewStats: canViewStats(shell),
    pendingCount: pending?.count ?? 0,
    rulesMarkdown: shell.bingo.rulesMarkdown ?? "",
    canSeeAllBingos: !!user?.isAdmin || devMode,
  };
}
