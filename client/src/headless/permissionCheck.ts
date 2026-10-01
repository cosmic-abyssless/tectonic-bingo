// The pure side of headless/permissions.ts: answering can() questions from the viewer's resolved Actions, and what to
// tell them when one goes. No React, so the view-model builders (boardModel.ts) and tests can use it.
import { GRANTS, type Action, type BingoPermissionsResponse, type Role } from "@bingo/shared";

/** Whether the viewer may take an Action, and if a role of theirs grants it but it's closed right now, why not. */
export interface CanResult {
  allowed: boolean;
  /** In the server's words; null when it's allowed, or when no role of theirs grants it (then its control isn't shown). */
  reason: string | null;
}
export type CanCheck = (action: Action) => CanResult;

const REFUSED: CanResult = { allowed: false, reason: null };

/** Answers can() questions from a permissions response; everything is refused until it has loaded. */
export function permissionCheck(permissions: BingoPermissionsResponse | undefined): CanCheck {
  return (action) => (permissions ? { allowed: permissions.allowed.includes(action), reason: permissions.reasons[action] ?? null } : REFUSED);
}

const ROLE_NAMES: Record<Exclude<Role, "admin">, string> = { moderator: "a Moderator", captain: "a Captain", player: "a Player" };

/**
 * What the toast says when the viewer loses `action` (a page, or a control's dialog): the role they lost that granted
 * it ("You're no longer a Moderator on <Bingo>"), or else why it's closed now (the stage moved on).
 */
export function lostAccessMessage(before: BingoPermissionsResponse, after: BingoPermissionsResponse, action: Action, bingoName: string): string {
  const lost = before.roles.filter((role) => !after.roles.includes(role));
  const grants = (role: Role) => {
    const roleGrants = GRANTS[role];
    return roleGrants === "*" || roleGrants.some((grant) => grant.action === action);
  };
  const role = lost.find(grants) ?? lost[0];
  if (role === "admin") return "You're no longer an Admin";
  if (role) return `You're no longer ${ROLE_NAMES[role]} on ${bingoName}`;
  return after.reasons[action] ?? `You no longer have access to that in ${bingoName}`;
}
