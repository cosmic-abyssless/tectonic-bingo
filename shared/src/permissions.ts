// Who may do what in a Bingo (CONTEXT.md "Action"; docs/adr/0001-permissions.md). Roles grant Actions, some only in
// certain stages; rules that hold for everyone, Admins included, sit apart from the grants and every grant passes
// through them. One pure can() answers for the server and the client alike.
// Types only from index.ts: it re-exports this module, so a value imported back from it isn't there yet at load.
import type { Bingo, Stage } from "./index.ts";

/**
 * A user's standing in one Bingo. They combine: a Moderator can also be a Player, a Captain always is one, and Staff
 * who also play see the Bingo as a Player too. Owner is site-wide only (siteRoles), never a role in a Bingo: an Admin
 * whose Discord id is in ADMIN_DISCORD_IDS (CONTEXT.md "Owner").
 */
export type Role = "owner" | "admin" | "moderator" | "staff" | "captain" | "player";

export const ACTIONS = [
  /** The Site admin pages, outside any Bingo: users, Bingos, Historical imports, test data. */
  "administer_site",
  /** Granting and revoking site admin. Owners only, and never on an Owner. */
  "manage_site_admins",
  /** Every Admin's Claude connections to the admin MCP server, and revoking any of them. Owners only. */
  "manage_claude_connections",
  /** Setting a Bingo up and running it: settings, Board, Teams, Moderators, signup questions, stage changes, the pick order, Superlative tallies. */
  "administer_bingo",
  /** The mod panel: reviewing Submissions, Point Adjustments, the signup roster (pairings, withdrawals), Wrapped, the audit log. */
  "moderate_bingo",
  /** Making Submissions for your own Team, Proof screenshots included. */
  "submit",
  /** Submitting for a Team that isn't your own, naming the Player it's for. */
  "submit_for_any_team",
  /** Reacting to your own Team's Submissions (CONTEXT.md "Reaction"). */
  "react",
  /** Picking for your own Team when it's on the clock. */
  "make_draft_pick",
  /** Picking for whichever Team is on the clock, and undoing the latest pick. */
  "run_draft",
  /** Rating signups for your Team's scouting list (CONTEXT.md "Pick Rating"). */
  "rate_picks",
  /** Renaming your own Team, from the Team dialog. Renaming any Team from the mod panel is administer_bingo. */
  "rename_team",
  /** Marking a signup's Buy-in received, or not, and who collected it. */
  "mark_buyins",
  /** Answering a Finished Bingo's Feedback form (CONTEXT.md "Feedback response"); the Captains-only questions need being a Captain on top. */
  "answer_feedback",
  /** Adding, editing, reordering and deleting a Bingo's Feedback questions, at any stage. */
  "manage_feedback_questions",

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
  /** A Bingo's Feedback results: how many responded, each response in turn, and the totals. */
  "view_feedback_results",
  /** The Buy-ins page: each signup's RSN, Discord name and Buy-in, who collected it and who recorded it. Nothing else of theirs. */
  "view_buyins",
] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * The Actions a Restriction can take (CONTEXT.md "Restriction"): the ones that do something and that someone other than
 * an Admin holds. Not what a user sees (the view_ Actions), not a Captain's make_draft_pick (a Captain who can't pick
 * is replaced instead), not moderate_bingo (all of the mod panel: taking it is removing the Moderator), and not what
 * only Admins hold, since Admins can't be restricted. A new Action isn't restrictable until it's listed here.
 */
export const RESTRICTABLE_ACTIONS = ["submit", "submit_for_any_team", "react", "rate_picks", "rename_team", "mark_buyins"] as const satisfies readonly Action[];
export type RestrictableAction = (typeof RESTRICTABLE_ACTIONS)[number];

/**
 * What a Restriction takes: one restrictable Action, or a wildcard ending in "*" that takes every restrictable Action
 * whose name starts with what comes before it ("submit*" takes submit and submit_for_any_team; "*" alone takes them
 * all). A wildcard never reaches an Action that isn't restrictable.
 */
export type RestrictionTarget = RestrictableAction | `${string}*`;

/** One user's Restriction in one Bingo, as can() reads it. */
export interface Restriction {
  action: RestrictionTarget;
  reason: string;
}

/**
 * A Restriction as the Bingo's Moderators and Admins see it, on the user's roster row (GET .../mod/signups): who it's
 * on, who applied it (a label, kept even if they've left) and when.
 */
export interface RestrictionEntry extends Restriction {
  id: string;
  userId: string;
  appliedByLabel: string | null;
  appliedAt: string;
}

/** Whether a Restriction on `target` takes `action`. */
export function restrictionCovers(target: string, action: Action): boolean {
  if (!(RESTRICTABLE_ACTIONS as readonly Action[]).includes(action)) return false;
  return target.endsWith("*") ? action.startsWith(target.slice(0, -1)) : target === action;
}

/** The restrictable Actions a Restriction on `target` takes: none for something that isn't a RestrictionTarget. */
export function restrictedBy(target: string): RestrictableAction[] {
  return RESTRICTABLE_ACTIONS.filter((action) => restrictionCovers(target, action));
}

/** Whether `value` can be restricted: a restrictable Action, or a wildcard that takes at least one. */
export function isRestrictionTarget(value: unknown): value is RestrictionTarget {
  return typeof value === "string" && !value.slice(0, -1).includes("*") && restrictedBy(value).length > 0;
}

const RESTRICTABLE_ACTION_WORDS: Record<RestrictableAction, string> = {
  submit: "submitting",
  submit_for_any_team: "submitting for other Teams",
  react: "reacting",
  rate_picks: "rating picks",
  rename_team: "renaming their Team",
  mark_buyins: "marking Buy-ins",
};

/** What a Restriction on `target` takes, in words: "submitting and submitting for other Teams", "everything". */
export function describeRestrictionTarget(target: string): string {
  if (target === "*") return "everything that can be restricted";
  const words = restrictedBy(target).map((action) => RESTRICTABLE_ACTION_WORDS[action]);
  return words.length === 0 ? target : words.length === 1 ? words[0]! : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** What a restricted user is told, on the control and in the server's 403 alike. */
export function restrictedReason(restriction: Restriction): string {
  return `Restricted: ${restriction.reason.trim().replace(/\.+$/, "")}`;
}

/**
 * The roles a Moderator may restrict. Listed as who they may restrict rather than who they may not, so a target who
 * holds any other role (Moderator, or one added later) is refused.
 */
export const MODERATOR_RESTRICTS: readonly Role[] = ["captain", "player"];

/**
 * Whether someone holding `actorRoles` in a Bingo may apply or lift a Restriction on someone holding `targetRoles` there:
 * an Admin on anyone but an Admin, a Moderator only on someone whose every role is in MODERATOR_RESTRICTS.
 */
export function mayRestrict(actorRoles: readonly Role[], targetRoles: readonly Role[]): boolean {
  if (targetRoles.includes("admin")) return false;
  if (actorRoles.includes("admin")) return true;
  return actorRoles.includes("moderator") && targetRoles.every((role) => MODERATOR_RESTRICTS.includes(role));
}

/** The Actions only Owners hold: Admin's "every Action" stops short of them. */
export const OWNER_ACTIONS = ["manage_site_admins", "manage_claude_connections"] as const satisfies readonly Action[];

/** An Action a role holds, in every stage or only in the ones listed. */
export interface Grant {
  action: Action;
  stages?: readonly Stage[];
}

/** What can() needs of a Bingo: its stage and the per-Bingo settings its rules read. */
export type PermissionBingo = Pick<Bingo, "stage" | "showScreenshotsWhenFinished">;

// Before play starts: what Pick Ratings lock on (isBoardLocked).
const BEFORE_LIVE: readonly Stage[] = ["planning", "signup", "captains", "draft", "reveal"];
// Before Board revealed: while the Teams are still being made.
const BEFORE_REVEAL: readonly Stage[] = ["planning", "signup", "captains", "draft"];
// Past Planning, which is for Moderators and Admins only (CONTEXT.md "Stage").
const AFTER_PLANNING: readonly Stage[] = ["signup", "captains", "draft", "reveal", "live", "complete"];
// While Captains scout the signups and pick: their window on a player's signup answers.
const SCOUTING: readonly Stage[] = ["signup", "captains", "draft"];
// While Buy-ins are collected: from Signups open until play starts.
const BUYINS: readonly Stage[] = ["signup", "captains", "draft", "reveal"];

/**
 * Every role's grants. Each role lists its Actions in full, so a new Action is never granted to one by accident; Admin
 * alone holds every Action in every stage, but for the Owner's (OWNER_ACTIONS). Filled in from what the server enforced
 * before can() existed.
 */
export const GRANTS: { readonly admin: "*" } & { readonly [R in Exclude<Role, "admin">]: readonly Grant[] } = {
  // An Owner is always an Admin too (siteRoles), so Admin's Actions aren't repeated here.
  owner: OWNER_ACTIONS.map((action) => ({ action })),
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
    { action: "mark_buyins" },
    { action: "view_buyins" },
    { action: "view_feedback_results" },
  ],
  // Clan leadership collecting the Buy-ins: those, while they're collected, and nothing else (CONTEXT.md "Staff").
  staff: [
    { action: "mark_buyins", stages: BUYINS },
    { action: "view_buyins", stages: BUYINS },
  ],
  // A Captain is always a Player too (they're on a Team), so what every Player sees isn't repeated here.
  captain: [
    { action: "make_draft_pick" },
    { action: "rate_picks" },
    // Once the Draft has set the Team, until Live locks its name (CONTEXT.md "Team name").
    { action: "rename_team", stages: ["reveal"] },
    { action: "view_draft_room", stages: ["signup", "captains"] },
    { action: "view_draft_pool_answers" },
    { action: "view_player_card_answers", stages: SCOUTING },
  ],
  // Submitting and reacting keep their own rules on top (submissionService: Live only, your own Team's Submissions);
  // they're granted here so that a Restriction can take them.
  player: [
    { action: "submit" },
    { action: "react" },
    // Open from Finished (the rule below), and a Captain is a Player, so they hold it too.
    { action: "answer_feedback" },
    { action: "view_bingo", stages: AFTER_PLANNING },
    { action: "view_team_stats", stages: ["live"] },
    { action: "view_draft_room", stages: ["captains", "draft", "reveal", "live", "complete"] },
  ],
};

/**
 * Each Action in words, for the mod panel's Permissions tab, which lists what every role holds. Typed over every
 * Action, so a new one can't ship without saying what it is. `onlyIn` is for an Action whose stages a check outside
 * can() narrows further, so the tab doesn't say it's open where that check refuses it.
 */
export const ACTION_INFO: { readonly [A in Action]: { label: string; description?: string; onlyIn?: readonly Stage[] } } = {
  administer_site: { label: "Site admin pages", description: "Users, Bingos, Historical imports and test data, outside any Bingo." },
  manage_site_admins: { label: "Manage site admins", description: "Granting and revoking site admin. Never on an Owner." },
  manage_claude_connections: { label: "See everyone's Claude connections", description: "Every Admin's connections to the admin MCP server, and revoking any of them." },
  administer_bingo: {
    label: "Run the Bingo",
    description: "Settings, Board, Teams, Moderators and Staff, signup questions, stage changes, the pick order and Superlative tallies.",
  },
  moderate_bingo: {
    label: "Mod panel",
    description: "Reviewing Submissions, Point Adjustments, the signup roster (pairings, withdrawals, Restrictions), Wrapped and the audit log.",
  },
  // submissionService: assertSubmissionsOpen takes Submissions while Live only, and reactions close once Finished
  // (with no Submissions before Live, that leaves Live).
  submit: { label: "Submit", description: "Submissions for their own Team, Proof screenshots included.", onlyIn: ["live"] },
  submit_for_any_team: { label: "Submit for any Team", description: "For a Team that isn't their own, naming the Player it's for.", onlyIn: ["live"] },
  react: { label: "React", description: "To their own Team's Submissions.", onlyIn: ["live"] },
  make_draft_pick: { label: "Make Draft picks", description: "For their own Team, when it's on the clock." },
  run_draft: { label: "Run the Draft", description: "Picking for whichever Team is on the clock, and undoing the latest pick." },
  rate_picks: { label: "Rate picks", description: "Signups on their Team's scouting list." },
  rename_team: { label: "Rename their Team", description: "From the Team dialog. Renaming any Team from the mod panel is running the Bingo." },
  mark_buyins: { label: "Mark Buy-ins", description: "A signup's Buy-in received or not, and who collected it." },
  answer_feedback: { label: "Give feedback", description: "Answer the Feedback form, anonymously, once the Bingo is Finished.", onlyIn: ["complete"] },
  manage_feedback_questions: { label: "Feedback questions", description: "Add, edit, reorder and delete the Feedback form's questions, at any stage." },
  view_bingo: { label: "The Bingo", description: "Its Board, Teams, rules, players and the pages under it." },
  view_hidden_board: { label: "The hidden Board", description: "The Board before Board revealed, and sealed Tiles in full: rules text, exclusive item lists, Task interest." },
  view_other_teams: { label: "Other Teams", description: "Their progress, Submissions and activity, and every Team's stats." },
  view_team_stats: { label: "Their Team's stats", description: "Before every Team's are open." },
  view_mod_activity: { label: "Mod-only activity", description: "The entries in a Team's activity that only Moderators see." },
  view_other_teams_screenshots: { label: "Other Teams' screenshots", description: "In a Finished Bingo, where Show screenshots once Finished leaves them out." },
  view_wrapped_preview: { label: "Wrapped preview", description: "Wrapped before it's published." },
  view_draft_room: { label: "The draft room", description: "Scouting the signups before the Draft, then the Draft itself." },
  view_draft_pool_answers: { label: "Signup answers in the draft pool" },
  view_player_card_answers: { label: "Signup answers on player cards" },
  view_mod_questions: { label: "Mod-only answers", description: "Answers to signup questions only Moderators may see." },
  view_admin_questions: { label: "Admin-only answers", description: "Answers to signup questions only Admins may see." },
  view_any_player: { label: "Anyone's player card", description: "Of anyone in the clan, not only those in the Bingo." },
  view_feedback_results: { label: "Feedback results", description: "How many Players and Captains responded, each response in turn (never who gave it), and the totals." },
  view_buyins: { label: "Buy-ins", description: "Each signup's RSN, Discord name and Buy-in, who collected it and who recorded it." },
};

/**
 * Rules that hold for everyone, Admins included: an Action granted by a role is still refused while its rule says no.
 * Not grants, so a new grant can't skip them. Each returns whether the Action is open in this Bingo right now.
 */
export const RULES: { readonly [A in Action]?: (bingo: PermissionBingo) => boolean } = {
  make_draft_pick: (bingo) => bingo.stage === "draft",
  run_draft: (bingo) => bingo.stage === "draft",
  rate_picks: (bingo) => BEFORE_LIVE.includes(bingo.stage),
  mark_buyins: (bingo) => BUYINS.includes(bingo.stage),
  // The Feedback form is open only while the Bingo is Finished: it closes, keeping its answers, if the Bingo is reopened.
  answer_feedback: (bingo) => bingo.stage === "complete",
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

/**
 * Roles outside any Bingo: a site admin's, on the Site admin pages, and an Owner's on top. Whether they're an Owner is
 * the server's to say (ADMIN_DISCORD_IDS): it sends it to the client as MeResponse.isOwner.
 */
export function siteRoles(user: { isAdmin: boolean }, isOwner = false): Role[] {
  if (!user.isAdmin) return [];
  return isOwner ? ["admin", "owner"] : ["admin"];
}

/** The grants `role` holds, Admin's "*" spelled out: every Action but the Owner's, in every stage. */
export function grantsOf(role: Role): readonly Grant[] {
  const grants = GRANTS[role];
  return grants === "*" ? ACTIONS.filter((action) => !(OWNER_ACTIONS as readonly Action[]).includes(action)).map((action) => ({ action })) : grants;
}

export type PermissionDenial = "role" | "stage" | "rule" | "restricted";
export type Permission =
  | { ok: true }
  | { ok: false; reason: Exclude<PermissionDenial, "restricted"> }
  | { ok: false; reason: "restricted"; restriction: Restriction };

/** Whether the rules for everyone leave `action` open in this Bingo, whoever asks. */
export function passesRules(bingo: PermissionBingo, action: Action): boolean {
  return RULES[action]?.(bingo) ?? true;
}

/**
 * Whether a user holding `roles`, under `restrictions` (theirs in this Bingo), may take `action` in `bingo` (null for
 * the Site admin pages, outside any Bingo). The reason says why not: no role grants it ("role"), a role grants it but
 * one of their Restrictions takes it ("restricted", whatever the stage), a role grants it but not in this stage
 * ("stage"), or it's granted (or open to everyone) but a rule for everyone refuses it ("rule"). An Admin's
 * Restrictions don't count: Admins can't be restricted, and one left from before they were made Admin doesn't hold.
 */
export function can(roles: readonly Role[], bingo: PermissionBingo | null, action: Action, restrictions: readonly Restriction[] = []): Permission {
  if (bingo && OPEN_TO_EVERYONE[action]?.(bingo)) return passesRules(bingo, action) ? { ok: true } : { ok: false, reason: "rule" };
  let granted = false;
  let inStage = false;
  for (const role of roles) {
    for (const grant of grantsOf(role)) {
      if (grant.action !== action) continue;
      granted = true;
      if (!grant.stages || (bingo && grant.stages.includes(bingo.stage))) inStage = true;
    }
  }
  if (!granted) return { ok: false, reason: "role" };
  const restriction = roles.includes("admin") ? undefined : restrictions.find((r) => restrictionCovers(r.action, action));
  if (restriction) return { ok: false, reason: "restricted", restriction };
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
  mark_buyins: () => "Buy-ins can only be marked from Signups open until the Bingo is Live",
  answer_feedback: () => "Feedback is open once the Bingo is Finished",
  view_buyins: () => "Buy-ins are only collected from Signups open until the Bingo is Live",
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
 * why not for each one a role of theirs grants but that's closed right now, or that a Restriction of theirs takes
 * ("Restricted: <its reason>"). An Action no role of theirs grants is in neither. `roles` are theirs in the Bingo, for
 * saying which one they lost.
 */
export interface BingoPermissionsResponse {
  roles: Role[];
  allowed: Action[];
  reasons: { [A in Action]?: string };
}

/** What a refusal other than by role tells the user: the Restriction's reason, or why the Action is closed now. */
export function refusalReason(bingo: PermissionBingo, action: Action, permission: Permission): string | null {
  if (permission.ok || permission.reason === "role") return null;
  return permission.reason === "restricted" ? restrictedReason(permission.restriction) : unavailableReason(bingo, action);
}

/** can() for every Action at once, for someone holding `roles`, under `restrictions`, in `bingo`. */
export function resolvePermissions(roles: readonly Role[], bingo: PermissionBingo, restrictions: readonly Restriction[] = []): BingoPermissionsResponse {
  const allowed: Action[] = [];
  const reasons: BingoPermissionsResponse["reasons"] = {};
  for (const action of ACTIONS) {
    const permission = can(roles, bingo, action, restrictions);
    if (permission.ok) allowed.push(action);
    const reason = refusalReason(bingo, action, permission);
    if (reason) reasons[action] = reason;
  }
  return { roles: [...roles], allowed, reasons };
}
