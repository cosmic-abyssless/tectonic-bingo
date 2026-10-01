// Who may do what in a Bingo (CONTEXT.md "Action"; docs/adr/0001-permissions.md). Roles grant Actions, some only in
// certain stages; rules that hold for everyone, Admins included, sit apart from the grants and every grant passes
// through them. One pure can() answers for the server and the client alike.
// Types only from index.ts: it re-exports this module, so a value imported back from it isn't there yet at load.
import type { Bingo, Stage } from "./index.ts";

/** A user's standing in one Bingo. They combine: a Moderator can also be a Player, a Captain always is one. */
export type Role = "admin" | "moderator" | "captain" | "player";

export const ACTIONS = [
  /** The Site admin pages, outside any Bingo: users, Bingos, Historical imports, test data. */
  "administer_site",
  /** Setting a Bingo up and running it: settings, Board, Teams, Moderators, signup questions, stage changes, the pick order, Superlative tallies. */
  "administer_bingo",
  /** The mod panel: reviewing Submissions, Point Adjustments, the signup roster (Buy-ins, pairings, withdrawals), Wrapped, the audit log. */
  "moderate_bingo",
  /** Submitting for a Team that isn't your own, naming the Player it's for. */
  "submit_for_any_team",
  /** Picking for your own Team when it's on the clock. */
  "make_draft_pick",
  /** Picking for whichever Team is on the clock, and undoing the latest pick. */
  "run_draft",
  /** Rating signups for your Team's scouting list (CONTEXT.md "Pick Rating"). */
  "rate_picks",
  /** Renaming your own Team, from the Team dialog. Renaming any Team from the mod panel is administer_bingo. */
  "rename_team",
] as const;
export type Action = (typeof ACTIONS)[number];

/** An Action a role holds, in every stage or only in the ones listed. */
export interface Grant {
  action: Action;
  stages?: readonly Stage[];
}

/** What can() needs of a Bingo: its stage (and, as rules come to need them, its per-Bingo settings). */
export type PermissionBingo = Pick<Bingo, "stage">;

// Before play starts: what Team names and Pick Ratings lock on (isBoardLocked).
const BEFORE_LIVE: readonly Stage[] = ["planning", "signup", "captains", "draft", "reveal"];

/**
 * Every role's grants. Each role lists its Actions in full, so a new Action is never granted to one by accident; Admin
 * alone holds every Action in every stage. Filled in from what the server enforced before can() existed.
 */
export const GRANTS: { readonly admin: "*" } & { readonly [R in Exclude<Role, "admin">]: readonly Grant[] } = {
  admin: "*",
  moderator: [{ action: "moderate_bingo" }, { action: "submit_for_any_team" }],
  captain: [{ action: "make_draft_pick" }, { action: "rate_picks" }, { action: "rename_team", stages: BEFORE_LIVE }],
  player: [],
};

/**
 * Rules that hold for everyone, Admins included: an Action granted by a role is still refused while its rule says no.
 * Not grants, so a new grant can't skip them. Each returns whether the Action is open in this Bingo right now.
 */
export const RULES: { readonly [A in Action]?: (bingo: PermissionBingo) => boolean } = {
  make_draft_pick: (bingo) => bingo.stage === "draft",
  run_draft: (bingo) => bingo.stage === "draft",
  rate_picks: (bingo) => BEFORE_LIVE.includes(bingo.stage),
};

export type PermissionDenial = "role" | "stage" | "rule";
export type Permission = { ok: true } | { ok: false; reason: PermissionDenial };

/** Whether the rules for everyone leave `action` open in this Bingo, whoever asks. */
export function passesRules(bingo: PermissionBingo, action: Action): boolean {
  return RULES[action]?.(bingo) ?? true;
}

/**
 * Whether a user holding `roles` may take `action` in `bingo` (null for the Site admin pages, outside any Bingo). The
 * reason says why not: no role grants it ("role"), a role grants it but not in this stage ("stage"), or it's granted
 * but a rule for everyone refuses it ("rule").
 */
export function can(roles: readonly Role[], bingo: PermissionBingo | null, action: Action): Permission {
  let granted = false;
  let inStage = false;
  for (const role of roles) {
    const grants = GRANTS[role];
    if (grants === "*") {
      granted = inStage = true;
      break;
    }
    for (const grant of grants) {
      if (grant.action !== action) continue;
      granted = true;
      if (!grant.stages || (bingo && grant.stages.includes(bingo.stage))) inStage = true;
    }
  }
  if (!granted) return { ok: false, reason: "role" };
  if (!inStage) return { ok: false, reason: "stage" };
  if (bingo && !passesRules(bingo, action)) return { ok: false, reason: "rule" };
  return { ok: true };
}
