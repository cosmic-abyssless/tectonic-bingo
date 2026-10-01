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

  // What a user can see. Everyone who can't see a Bingo still gets its name and stage, and its signup form while
  // Signups are open.
  /** A Bingo's content: its Board, Teams, rules, players and the pages under it. */
  "view_bingo",
  /** The Board before Board revealed, and in full while its Tiles are sealed: rules text, exclusive item lists, Task interest. */
  "view_hidden_board",
  /** Other Teams' progress, Submissions and activity, and every Team's stats. */
  "view_other_teams",
  /** Your own Team's stats, before every Team's are open. */
  "view_team_stats",
  /** The entries in a Team's activity that only Moderators see. */
  "view_mod_activity",
  /** Other Teams' screenshots, once a Finished Bingo leaves only the Submissions open (Show screenshots once Finished). */
  "view_other_teams_screenshots",
  /** Wrapped before it's published, as a preview worked out on the spot. */
  "view_wrapped_preview",
  /** The draft room: scouting the signups before the Draft, then the Draft itself. */
  "view_draft_room",
  /** Signup answers in the draft room's pool. */
  "view_draft_pool_answers",
  /** Signup answers on a player's card. */
  "view_player_card_answers",
  /** Answers to signup questions only Moderators may see (QuestionVisibility "mods"). */
  "view_mod_questions",
  /** Answers to signup questions only Admins may see (QuestionVisibility "admins"). */
  "view_admin_questions",
  /** The card of anyone in the clan, not only of those in the Bingo. */
  "view_any_player",
] as const;
export type Action = (typeof ACTIONS)[number];

/** An Action a role holds, in every stage or only in the ones listed. */
export interface Grant {
  action: Action;
  stages?: readonly Stage[];
}

/** What can() needs of a Bingo: its stage and the per-Bingo settings its rules read. */
export type PermissionBingo = Pick<Bingo, "stage" | "showScreenshotsWhenFinished">;

// Before play starts: what Team names and Pick Ratings lock on (isBoardLocked).
const BEFORE_LIVE: readonly Stage[] = ["planning", "signup", "captains", "draft", "reveal"];
// Before Board revealed: while the Teams are still being made.
const BEFORE_REVEAL: readonly Stage[] = ["planning", "signup", "captains", "draft"];
// Past Planning, which is for Moderators and Admins only (CONTEXT.md "Stage").
const AFTER_PLANNING: readonly Stage[] = ["signup", "captains", "draft", "reveal", "live", "complete"];
// While Captains scout the signups and pick: their window on a player's signup answers.
const SCOUTING: readonly Stage[] = ["signup", "captains", "draft"];

/**
 * Every role's grants. Each role lists its Actions in full, so a new Action is never granted to one by accident; Admin
 * alone holds every Action in every stage. Filled in from what the server enforced before can() existed.
 */
export const GRANTS: { readonly admin: "*" } & { readonly [R in Exclude<Role, "admin">]: readonly Grant[] } = {
  admin: "*",
  moderator: [
    { action: "moderate_bingo" },
    { action: "submit_for_any_team" },
    { action: "view_bingo" },
    { action: "view_hidden_board" },
    { action: "view_other_teams" },
    { action: "view_mod_activity" },
    { action: "view_other_teams_screenshots" },
    { action: "view_wrapped_preview" },
    { action: "view_draft_room" },
    { action: "view_draft_pool_answers" },
    { action: "view_player_card_answers" },
    { action: "view_mod_questions" },
    { action: "view_any_player" },
  ],
  // A Captain is always a Player too (they're on a Team), so what every Player sees isn't repeated here.
  captain: [
    { action: "make_draft_pick" },
    { action: "rate_picks" },
    { action: "rename_team", stages: BEFORE_LIVE },
    { action: "view_draft_room", stages: ["signup", "captains"] },
    { action: "view_draft_pool_answers" },
    { action: "view_player_card_answers", stages: SCOUTING },
  ],
  player: [
    { action: "view_bingo", stages: AFTER_PLANNING },
    { action: "view_team_stats", stages: ["live"] },
    { action: "view_draft_room", stages: ["captains", "draft", "reveal", "live", "complete"] },
  ],
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

/**
 * Rules that hold for everyone the other way: while one says yes, the Action is open to every clan member, whatever
 * their roles (the rules above still apply). A Finished Bingo is open, read-only, to everyone, and so are other Teams'
 * screenshots in it while Show screenshots once Finished is on.
 */
export const OPEN_TO_EVERYONE: { readonly [A in Action]?: (bingo: PermissionBingo) => boolean } = {
  view_bingo: (bingo) => bingo.stage === "complete",
  view_other_teams: (bingo) => bingo.stage === "complete",
  view_draft_room: (bingo) => bingo.stage === "complete",
  view_other_teams_screenshots: (bingo) => bingo.stage === "complete" && bingo.showScreenshotsWhenFinished,
};

/** Roles outside any Bingo: a site admin's, on the Site admin pages. */
export function siteRoles(user: { isAdmin: boolean }): Role[] {
  return user.isAdmin ? ["admin"] : [];
}

export type PermissionDenial = "role" | "stage" | "rule";
export type Permission = { ok: true } | { ok: false; reason: PermissionDenial };

/** Whether the rules for everyone leave `action` open in this Bingo, whoever asks. */
export function passesRules(bingo: PermissionBingo, action: Action): boolean {
  return RULES[action]?.(bingo) ?? true;
}

/**
 * Whether a user holding `roles` may take `action` in `bingo` (null for the Site admin pages, outside any Bingo). The
 * reason says why not: no role grants it ("role"), a role grants it but not in this stage ("stage"), or it's granted
 * (or open to everyone) but a rule for everyone refuses it ("rule").
 */
export function can(roles: readonly Role[], bingo: PermissionBingo | null, action: Action): Permission {
  if (bingo && OPEN_TO_EVERYONE[action]?.(bingo)) return passesRules(bingo, action) ? { ok: true } : { ok: false, reason: "rule" };
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

/**
 * What a user is told when a role of theirs grants an Action that's closed right now, for the stage or by a rule for
 * everyone. The server's refusal says the same words (server/src/services/permissions.ts), and so does the client's
 * disabled control. A function of the Bingo, since one Action can be closed for different reasons in different stages.
 * Not for a refusal by role: a control no role of the user's grants isn't shown at all.
 */
export const UNAVAILABLE_REASONS: { readonly [A in Action]?: (bingo: PermissionBingo) => string } = {
  make_draft_pick: () => "Picks can only be made during the draft stage",
  run_draft: () => "Picks can only be undone during the draft stage",
  rate_picks: () => "Ratings are locked once the bingo is live",
  rename_team: (bingo) => (BEFORE_REVEAL.includes(bingo.stage) ? "Team names can be changed once the Board is revealed" : "Team names are locked once the Bingo is Live"),
  view_team_stats: () => "Stats aren't visible until the bingo is complete",
  view_draft_room: (bingo) =>
    bingo.stage === "signup"
      ? "Scouting is only visible to captains and mods"
      : bingo.stage === "captains"
        ? "Scouting is only visible to this bingo's players and mods"
        : "The draft room is only visible to this bingo's players and mods",
};

/** Why `action` is closed in `bingo` right now: UNAVAILABLE_REASONS' words, or general ones for an Action without any. */
export function unavailableReason(bingo: PermissionBingo, action: Action): string {
  return UNAVAILABLE_REASONS[action]?.(bingo) ?? "Not available at this stage of the bingo";
}

/**
 * A viewer's Actions in one Bingo at its current stage (GET /api/bingos/:slug/permissions): the ones they may take, and
 * why not for each one a role of theirs grants but that's closed right now. An Action no role of theirs grants is in
 * neither. `roles` are theirs in the Bingo, for saying which one they lost.
 */
export interface BingoPermissionsResponse {
  roles: Role[];
  allowed: Action[];
  reasons: { [A in Action]?: string };
}

/** can() for every Action at once, for someone holding `roles` in `bingo`. */
export function resolvePermissions(roles: readonly Role[], bingo: PermissionBingo): BingoPermissionsResponse {
  const allowed: Action[] = [];
  const reasons: BingoPermissionsResponse["reasons"] = {};
  for (const action of ACTIONS) {
    const permission = can(roles, bingo, action);
    if (permission.ok) allowed.push(action);
    else if (permission.reason !== "role") reasons[action] = unavailableReason(bingo, action);
  }
  return { roles: [...roles], allowed, reasons };
}
