import { STAGE_LABEL, areRulesHidden, type BingoShellResponse } from "@bingo/shared";
import { useBingo, useDraftState, usePendingCount } from "../api/queries";
import { useAuth } from "../context/AuthContext";

// What a bingo's page header shows, for the pages around the board (the draft room, stats, Rewind, Wrapped): the same
// header and ☰ menu as the board page, without loading the board. The board page's own model (useBingoPage) carries
// the same fields.

export interface BingoHeaderModel {
  name: string;
  stage: BingoShellResponse["bingo"]["stage"];
  /** "Signups open", "Draft", "Live"… */
  stageLabel: string;
  isMod: boolean;
  canViewStats: boolean;
  /** Rewind (CONTEXT.md) exists only once the bingo is Finished. */
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
   * The draft room, when there's a way into it (the board's banners): "draft" in the Draft stage once the room lets
   * this viewer in, "scouting" while they may scout (canScout).
   */
  draftRoom: "draft" | "scouting" | null;
  /** Wrapped (CONTEXT.md) can be opened: published, or a Moderator's preview. Same as the board's wrapped.canOpen. */
  canOpenWrapped: boolean;
}

/** What the Rules dialog says while the rules are held back (Hide rules, during Board revealed). */
export const RULES_COME_LATER = "The rules will be posted at a later date.";

/**
 * Players see their own team's stats while the bingo is live and everyone's once it's over (the stats endpoint 403s
 * otherwise); mods see them throughout.
 */
export function canViewStats(shell: Pick<BingoShellResponse, "bingo" | "isMod" | "myTeam">): boolean {
  return shell.isMod || shell.bingo.stage === "complete" || (shell.bingo.stage === "live" && !!shell.myTeam);
}

/**
 * Scouting (CONTEXT.md): Captains get picked while signups are open (#39), so leads (and mods) scout ahead; once Signups
 * are closed every Player can look through them too.
 */
export function canScout(shell: Pick<BingoShellResponse, "bingo" | "isMod" | "myTeam" | "teams" | "viewer">, userId: string | undefined): boolean {
  const { stage } = shell.bingo;
  const myTeam = shell.teams.find((t) => t.id === shell.myTeam?.id);
  const isLead = !!myTeam?.members.some((m) => m.user.id === userId && (m.isCaptain || m.isCoCaptain));
  return (stage === "signup" && (shell.isMod || isLead)) || (stage === "captains" && (shell.isMod || isLead || shell.viewer.canSee));
}

/** Null while the bingo is loading. */
export function useBingoHeader(slug: string): BingoHeaderModel | null {
  const { user, devMode } = useAuth();
  const { data: shell } = useBingo(slug);
  const { data: pending } = usePendingCount(slug, !!shell?.isMod);
  // The same query the board asks in the Draft stage: having draft state at all means the room lets this viewer in.
  const { data: draftState } = useDraftState(shell?.bingo.stage === "draft" && shell.viewer.canSee ? slug : undefined);
  if (!shell) return null;
  return {
    name: shell.bingo.name,
    stage: shell.bingo.stage,
    stageLabel: STAGE_LABEL[shell.bingo.stage],
    isMod: shell.isMod,
    canViewStats: canViewStats(shell),
    canRewind: shell.bingo.stage === "complete",
    pendingCount: pending?.count ?? 0,
    rulesMarkdown: shell.bingo.rulesMarkdown ?? "",
    rulesComeLater: !shell.isMod && areRulesHidden(shell.bingo),
    canSeeAllBingos: !!user?.isAdmin || devMode,
    draftRoom: shell.bingo.stage === "draft" ? (draftState ? "draft" : null) : canScout(shell, user?.id) ? "scouting" : null,
    canOpenWrapped: shell.bingo.stage === "complete" && (shell.wrappedPublished || shell.isMod),
  };
}
