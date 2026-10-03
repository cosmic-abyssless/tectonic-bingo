// Ubiquitous audit log — types + action registry shared by server and
// client. See docs/audit-log-plan.md for the full design.
//
// AuditDetailsMap has one key per audited action; AUDIT_ACTIONS must define
// every key in that map (enforced by the `Record<AuditAction, ...>` type
// below) — adding an action without both is a compile error. This is the
// compile-time half of "a new action can't silently escape the log" (the
// other two are the server's routeCoverage test and the http.mutation
// fallback — see server/src/audit/routePolicy.ts and middleware.ts).
import type { AchievementKey } from "./achievements.ts";
import type { MinimalUser, Stage } from "./index.ts";
import { playerName } from "./names.ts";
import { describeRestrictionTarget } from "./permissions.ts";

export type AuditVisibility = "mods" | "team" | "public";
export type AuditActorType = "user" | "system";
export type AuditActorRole = "admin" | "mod" | "staff" | "player" | "system";
// Matches client/src/core/ui/Card.tsx's Badge TONE keys.
export type AuditTone = "neutral" | "info" | "ok" | "warn" | "danger";

export type AuditCategory = "bingo" | "settings" | "board" | "signup" | "draft" | "team" | "submission" | "points" | "moderation" | "system" | "http" | "bug_report" | "achievement" | "superlative";

export type AuditEntityType =
  | "bingo"
  | "user"
  | "item_group"
  | "piece_value"
  | "wom_past_competition"
  | "site_settings"
  | "category"
  | "tile"
  | "node"
  | "line"
  | "question"
  | "superlative_category"
  | "team"
  | "submission"
  | "adjustment"
  | "signup"
  | "pairing"
  | "http"
  | "mcp_tool"
  | "mcp_connection"
  | "bug_report"
  | "achievement";

/** Changed fields only — before/after per key, never a full row snapshot. */
export type FieldChanges<T> = { before: Partial<T>; after: Partial<T> };

// ---------------------------------------------------------------------------
// Per-action details shapes
// ---------------------------------------------------------------------------

export interface AuditDetailsMap {
  "bingo.created": { slug: string; name: string; theme: string; boardRows: number; boardCols: number; source: "form" | "import" };
  "bingo.deleted": { slug: string; name: string; stage: Stage; counts: { teams: number; signups: number; submissions: number } };
  /** A Historical Bingo (CONTEXT.md) imported from a bundle. `source`: what the bundle was made from. */
  "bingo.historical_imported": {
    slug: string;
    name: string;
    source: string;
    counts: {
      tiles: number; teams: number; players: number; usersCreated: number; unknownPlayers: number; standings: number; womCompetition: boolean;
      /** A rich bundle's (version 2) sections. */
      tasks?: number; lines?: number; submissions?: number; signups?: number; cutSignups?: number; draftPicks?: number;
    };
  };

  /** The last of a Historical Bingo's pending screenshots was attached (one entry for them all, not one each). */
  "bingo.historical_screenshots_attached": { slug: string; name: string; screenshots: number };

  "user.admin_changed": { isAdmin: { before: boolean; after: boolean }; source: "admin_panel" | "env_bootstrap" };

  "item_group.created": { name: string; itemCount: number };
  "item_group.updated": { changes: FieldChanges<{ name: string; description: string | null }>; items: { added: string[]; removed: string[] } };
  "item_group.deleted": { name: string; itemNames: string[] };

  // wholeQuantity is absent in entries written before it existed (read as 1).
  "piece_value.created": { pieceItemName: string; wholeItemName: string; wholeQuantity?: number; divisor: number; otherPieces: string[] };
  "piece_value.updated": { changes: FieldChanges<{ pieceItemName: string; wholeItemName: string; wholeQuantity: number; divisor: number; otherPieces: string[] }> };
  "piece_value.deleted": { pieceItemName: string; wholeItemName: string; wholeQuantity?: number; divisor: number; otherPieces: string[] };
  "piece_value.item_dismissed": { itemName: string };
  "piece_value.item_restored": { itemName: string };

  "title_settings.updated": { changes: FieldChanges<Record<string, number | string | boolean>> };

  "wom_past_competition.added": { womId: number; title: string; participantCount: number; source: "manual" | "auto" };
  "wom_past_competition.renamed": { womId: number; from: string; to: string };
  "wom_past_competition.deleted": { womId: number; title: string };

  "settings.updated": {
    changes: FieldChanges<{
      name: string;
      description: string | null;
      theme: string;
      signupMode: string;
      leftoverMode: string;
      cutMode: string;
      warnLeftovers: boolean;
      buyinAmount: number | null;
      bonusPotAmount: number;
      rulesMarkdown: string | null;
      exclusivityRulesJson: string;
      /** Only on entries written before Credits moved onto the Wrapped art (#281). */
      wrappedCreditsJson?: string;
      signupOpensAt: string | null;
      draftScheduledAt: string | null;
      revealScheduledAt: string | null;
      startsAt: string | null;
      endsAt: string | null;
      womEnabled: boolean;
      womGroupId: string | null;
      womGroupVerificationCode: string;
      discordEnabled: boolean;
      discordCategoryName: string | null;
      discordGuildId: string | null;
      discordChannelsJson: string;
      achievementsEnabled: boolean;
      sealedTiles: boolean;
      hideRules: boolean;
      showScreenshotsWhenFinished: boolean;
      publishWrappedOnFinish: boolean;
    }>;
  };

  "moderator.added": { userId: string; displayName: string };
  "moderator.removed": { userId: string; displayName: string };
  "staff.added": { userId: string; displayName: string };
  "staff.removed": { userId: string; displayName: string };
  /** A Restriction (CONTEXT.md) applied to or lifted from a user. `action`: the Action or wildcard it takes. */
  "restriction.applied": { userId: string; displayName: string; action: string; reason: string };
  "restriction.lifted": { userId: string; displayName: string; action: string; reason: string };

  "category.created": { label: string; colorHex: string | null; sortOrder: number };
  "category.updated": { changes: FieldChanges<{ label: string; colorHex: string | null; sortOrder: number }> };
  "category.deleted": { label: string; tilesUnassigned: number };

  "tile.created": { name: string; boardRow: number; boardCol: number; categoryId: string | null };
  "tile.updated": { changes: FieldChanges<{ name: string; boardRow: number; boardCol: number; categoryId: string | null; imageUrl: string | null; hasFreezePeriod: boolean; freezeDurationMinutes: number; notes: string | null }> };
  "tile.deleted": { name: string; boardRow: number; boardCol: number; taskCount: number };
  "tile.bonus_points_updated": { points: { before: number; after: number } };

  "task.created": { tileId: string; tileName: string; after: TaskSnapshot };
  "task.updated": { tileId: string; tileName: string; before: TaskSnapshot; after: TaskSnapshot };
  "task.deleted": { tileId: string; tileName: string; before: TaskSnapshot };

  "line.generated": { pointsPerLine: number; replaced: number; created: { row: number; column: number; diagonal: number } };
  "line.updated": { lineType: string; lineIndex: number; points: { before: number; after: number } };
  "line.deleted": { lineType: string; lineIndex: number; points: number };

  // `form`: "feedback" for a Feedback question (CONTEXT.md); absent means a signup question, as every entry from before
  // Feedback questions was.
  "question.created": { prompt: string; type: string; required: boolean; form?: "feedback" };
  "question.updated": { changes: FieldChanges<{ prompt: string; helperText: string | null; type: string; optionsJson: string | null; allowOther: boolean; multiplePicks: boolean; maxPicks: number | null; required: boolean; sortOrder: number; audience: string; visibility: string }>; form?: "feedback" };
  /** `answersDeleted`: how many players' (non-blank) answers went with it. Absent on entries from before answers could be deleted along with it. */
  "question.deleted": { prompt: string; type: string; required: boolean; answersDeleted?: number; form?: "feedback" };
  "question.reordered": { order: string[]; form?: "feedback" };

  "superlative.category_created": { name: string };
  "superlative.category_updated": { changes: FieldChanges<{ name: string }> };
  /** `votesDeleted`: how many votes (across every Team) went with it. */
  "superlative.category_deleted": { name: string; votesDeleted: number };
  "superlative.category_reordered": { order: string[] };

  "team.created": { name: string; captainUserId: string; captainName: string; coCaptainUserId: string | null; coCaptainName: string | null; color: string | null };
  "team.updated": { changes: FieldChanges<{ name: string; color: string | null }>; codeword?: { changed: true } };
  "team.member_added": { userId: string; displayName: string };
  /**
   * `removedFromTeam`: Remove from Team (from Board revealed on), which also withdrew their Signup; `reason` is the
   * Admin's optional note. `newCaptainName`/`newCoCaptainName`: who took over a removed Captain's or co-captain's role.
   */
  "team.member_removed": { userId: string; displayName: string; removedFromTeam?: true; reason?: string | null; newCaptainName?: string; newCoCaptainName?: string };
  "team.deleted": { name: string; captainName: string; memberCount: number };
  "team.tile_interest_set": { tileName: string; taskLabel: string; interested: boolean };

  // kind: "proof" for a Proof screenshot (no claims; taskLabels names its Task when the requirement is per-Task). Absent for a drop.
  "submission.created": { kind?: "proof"; tileId: string; tileName: string; taskLabels: string[]; claims: { nodeId: string; itemName: string | null; quantity: number }[]; screenshotUrl: string };
  // reaction: the emoji's name in words (SUBMISSION_REACTION_NAMES). ownSubmission: the reactor is who it belongs to.
  "submission.reaction_set": { emoji: string; reaction: string; reacted: boolean; tileName: string | null; submitterName: string | null; ownSubmission: boolean };
  "submission.approved": { kind?: "proof"; tileName: string | null; taskLabels: string[]; nodeIds: string[]; newlyCompletedNodeIds: string[]; pointsDelta: number; reviewerNotes: string | null; submittedByUserId: string };
  "submission.rejected": { kind?: "proof"; tileName: string | null; taskLabels: string[]; nodeIds: string[]; reviewerNotes: string | null; submittedByUserId: string };
  "submission.review_undone": {
    kind?: "proof";
    tileName: string | null;
    taskLabels: string[];
    nodeIds: string[];
    previousStatus: "approved" | "rejected";
    previousReviewerNotes: string | null;
    previousReviewedByUserId: string | null;
    /** Nodes that were complete before and no longer are (empty when undoing a rejection). */
    uncompletedNodeIds: string[];
    /** Points removed by the undo — zero or negative. */
    pointsDelta: number;
    submittedByUserId: string;
  };
  /** A mod changed which player a submission is credited to (someone forgot to pick the player they posted for). */
  "submission.attribution_changed": { kind?: "proof"; tileName: string | null; taskLabels: string[]; fromUserId: string; fromName: string; toUserId: string; toName: string };
  /** A Moderator priced the submission's claims again (only the claims whose Drop value changed). */
  "submission.repriced": { tileName: string | null; taskLabels: string[]; claims: { itemName: string; before: number | null; after: number | null }[] };
  "submission.screenshot_analyzed": { codewordVerified: boolean; detectedItemName: string | null; textLength: number };
  "submission.screenshot_analysis_failed": Record<string, never>;

  "points.adjusted": { amount: number; reason: string };
  /** One row per node whose awarded points changed when a submission was reviewed (or a review undone). */
  "points.earned": PointChangeDetails;
  "points.lost": PointChangeDetails;
  /** Net change for one team after a board edit re-scored the bingo (only written when non-zero). */
  "points.rescored": { delta: number };

  // startsAtBackfilled: only on entries written before a start date stopped being filled in by a stage change.
  "stage.changed": { from: Stage; to: Stage; startsAtBackfilled?: boolean };

  // Wrapped (CONTEXT.md): a Moderator publishing it, or publishing it again, which recomputes every Player's.
  "wrapped.published": { players: number };
  "wrapped.republished": { players: number };
  // Wrapped art (#262): an Admin adding or replacing, re-cutting, removing or reordering a cut-out. section: its group
  // (a section's Category images, "side" or "playerCard"). keyed: it was a solid-background screenshot, keyed out.
  "wrapped.art_set": { section: string; keyed: boolean; replaced: boolean };
  "wrapped.art_recut": { section: string; tolerance: number; softness: number };
  "wrapped.art_removed": { section: string };
  "wrapped.art_reordered": { section: string };
  // Credits (CONTEXT.md, #281): an Admin setting or clearing one image's credit, or a category's additional credits.
  "wrapped.art_credit_set": { section: string; name: string | null };
  "wrapped.credits_set": { section: string; count: number };

  "draft.started": { order: { teamId: string; name: string; draftOrder: number }[] };
  "draft.order_shuffled": { order: { teamId: string; name: string; draftOrder: number }[] };
  "draft.order_set": { order: { teamId: string; name: string; draftOrder: number }[] };
  "draft.pick": { pickNumber: number; userIds: string[]; displayNames: string[]; pair: boolean };
  "draft.pick_undone": { pickNumber: number; userIds: string[]; displayNames: string[]; pair: boolean };
  // names: the rated player(s), a pair's two halves. Rows from before notes were logged on their own lack names and
  // carry hasNote (whether the save also had a note) instead.
  "draft.rating_set": { rsn: string; names?: string[]; hasRating: boolean; hasNote?: boolean; cleared: boolean };
  "draft.note_set": { rsn: string; names: string[]; hasNote: boolean; cleared: boolean };
  // A Cut review was applied (CONTEXT.md "Cut review") — every individual pair/split/Team change it made is
  // audited separately under its own existing action; this entry is the record that a review happened for the
  // roster as it stood, including an empty `changes` (a deliberate "keep these cuts").
  // `applied`: each change as the modal words it ("Paired A & B"). Not `changes`, which the audit log reads as a
  // before/after diff; the earliest entries have that instead (the raw change list, ids only).
  "draft.cut_review_applied": { applied?: string[]; changes?: unknown[]; cutPlayersNow: number; cutPlayers: number };

  "pairing.requested": { requesterUserId: string; targetDiscordId: string };
  "pairing.accepted": { requesterUserId: string; targetDiscordId: string; partnerUserId: string | null };
  "pairing.declined": { requesterUserId: string; targetDiscordId: string };
  "pairing.cancelled": { requesterUserId: string; targetDiscordId: string };
  "pairing.dissolved": { requesterUserId: string; targetDiscordId: string; cause?: "withdrawal" };
  "pairing.left": { requesterUserId: string; targetDiscordId: string };
  "pairing.admin_paired": { userIds: string[]; displayNames: string[] };
  "pairing.unpaired": { userIds: string[]; displayNames: string[] };

  /** `late`: a Late signup, made by an Admin on the player's behalf after Signups closed. */
  "signup.created": { rsn: string; rsnVerified: boolean; answerCount: number; reactivated: boolean; late?: boolean };
  /**
   * `changes`: what changed, RSN and answers alike, keyed by "RSN" or the question's prompt, shown as before/after in
   * the log. Entries from before it carry `rsn` and `answersChanged` (question ids) instead; an unchanged save records
   * nothing.
   */
  "signup.updated": {
    rsn?: { before: string; after: string };
    rsnVerified?: boolean;
    answersChanged?: string[];
    changes?: { before: Record<string, string>; after: Record<string, string> };
  };
  /** A mod set or cleared a player's timezone from the signup roster. (A player's own change is a signup.updated "Timezone" change.) */
  "signup.timezone_set": { before: string | null; after: string | null };
  "signup.withdrawn": { rsn: string };
  "signup.buyin_marked": { received: boolean; collectedByUserId: string | null; collectedByName: string | null; before: { receivedAt: string | null } };
  "signup.stats_fetched": { womFound: boolean; runeProfileFound: boolean };
  "signup.stats_fetch_failed": { message: string };
  /** The player's account was renamed in-game: found by its WOM id when a mod refreshed their stats. */
  "signup.name_changed": { before: string; after: string; womId: string };

  "wom.competition_created": { competitionId: number };
  // changed: what the sync sent (older entries, from team renames only, have none).
  "wom.roster_synced": { changed?: ("title" | "startsAt" | "endsAt" | "teams")[] };
  /** The bulk update at start + 6h: WOM was asked to update every participant of the competition. */
  "wom.participants_updated": { competitionId: number };
  "wom.sync_failed": { operation: "create" | "rename" | "sync" | "update"; message: string };

  /** The Discord team sync (discordTeamService.ts) changed something: labels of what it made, edited or deleted. */
  "discord.synced": { created: string[]; updated: string[]; deleted: string[]; membersAdded: number; membersRemoved: number };
  /** Recorded once per distinct failure (a broken setup would otherwise add one per change). */
  "discord.sync_failed": { message: string };
  /** An Admin removed every Discord role and channel the sync made for the Bingo. */
  "discord.removed": { deleted: number };

  // Fallback-only: written by the server's finish-middleware for any
  // successful non-GET /api/* mutation that recorded nothing itself.
  /** A site admin's Claude app called a tool on the admin MCP server (server/src/mcp). */
  "mcp.tool_called": { tool: string; arguments: Record<string, unknown>; clientId: string; clientName: string | null; rowCount?: number; error?: string };
  /**
   * A Claude connection's tokens were revoked: by an Admin from Connected apps or Site admin ("revoked"), or because its
   * Admin lost the Admin role ("admin_removed"). The entry's entity is the connection; ownerUserId is whose it was.
   */
  "mcp.connection_revoked": { clientName: string; redirectHost: string | null; ownerUserId: string; ownerName: string; byOwner: boolean; reason: "revoked" | "admin_removed" };
  "http.mutation": { method: string; originalUrl: string; routePath: string | null; params: Record<string, unknown>; body: unknown; file: string | null };

  "bug_report.created": { description: string; pageUrl: string | null; palette: string | null };
  "bug_report.status_changed": { status: "open" | "resolved" | "closed"; resolutionMessage: string | null };

  /** A player earned an Achievement (CONTEXT.md). Actor is the player themselves. */
  "achievement.earned": { key: AchievementKey; name: string };
}

export interface PointChangeDetails {
  /** Which kind of points: a task's own points, a tile's full-completion bonus, or a line bonus. */
  source: "task" | "tile_bonus" | "line";
  nodeId: string;
  /** What to call it: the task's label (or item name), the tile's name, or "Row 3" / "Column 2" / "Diagonal 1". */
  nodeLabel: string;
  /** The tile it belongs to (null for a line). */
  tileName: string | null;
  /** Always positive; earned vs. lost is the action. */
  points: number;
  submissionId: string;
}

export interface TaskSnapshot {
  kind: string;
  label: string | null;
  points: number;
  minCount: number | null;
  quantity: number | null;
  itemName: string | null;
  /** "Magus vestige ÷ 3"; absent when none, and in entries written before Valued as existed. */
  valuedAs?: string;
  /** An Item's Counts as (CONTEXT.md); absent when 1, and in entries written before Counts as existed. */
  countsAs?: number;
  children: TaskSnapshot[];
}

export type AuditAction = keyof AuditDetailsMap;

// ---------------------------------------------------------------------------
// Action registry
// ---------------------------------------------------------------------------

export interface AuditLabelInput<A extends AuditAction> {
  details: AuditDetailsMap[A];
  entityLabel: string | null;
  actorName: string | null;
  teamName: string | null;
  onBehalfOfName: string | null;
}

export interface AuditActionDef<A extends AuditAction> {
  category: AuditCategory;
  tone: AuditTone;
  /** Default visibility; overridable per audit() call. */
  visibility: AuditVisibility;
  /** Static badge text, e.g. "Team renamed". */
  title: string;
  /** Full sentence, e.g. "Alice renamed Old Name to New Name". */
  label(input: AuditLabelInput<A>): string;
  /**
   * The label for a group of two or more entries of this action, newest first (see
   * condenseAuditEntries). Only actions that define it are ever grouped; leave it off anything whose
   * individual rows must stay visible (points, for one).
   */
  condense?(inputs: AuditLabelInput<A>[]): string;
}

const actor = (i: { actorName: string | null }) => i.actorName ?? "Someone";
const settingValue = (v: unknown) => (v === true ? "on" : v === false ? "off" : String(v));
// ` on "Pets"`, or nothing when the tile's name isn't there.
const onTile = (preposition: string, tileName: string | undefined) => (tileName ? ` ${preposition} "${tileName}"` : "");
/** "feedback" or "signup": which form a question audit entry is about (absent: signup, as before Feedback questions). */
const formWord = (d: { form?: "feedback" }) => (d.form === "feedback" ? "feedback" : "signup");
const onBehalf = (i: { onBehalfOfName: string | null }) => (i.onBehalfOfName ? ` (on behalf of ${i.onBehalfOfName})` : "");
/** "Green team's", or "their" when the team isn't known. */
const teamPossessive = (i: { teamName: string | null }) => (i.teamName ? `${i.teamName}'s` : "their");
/** The rated player(s): "A and B" for a pair. Older rows only have "A & B" (rsn). */
const ratedNames = (d: { rsn: string; names?: string[] }) => joinList(d.names ?? d.rsn.split(" & "));
/** "a, b and c". */
function joinList(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "a submission", or "a Proof screenshot" (CONTEXT.md) for a proof one. */
const aSubmission = (details: { kind?: "proof" }) => (details.kind === "proof" ? "a Proof screenshot" : "a submission");
/** "N submissions", or "N Proof screenshots" when every entry is a proof one. */
const nSubmissions = (inputs: { details: { kind?: "proof" } }[]) => `${inputs.length} ${inputs.every((i) => i.details.kind === "proof") ? "Proof screenshots" : "submissions"}`;
/** ` (Wintertodt)`: a per-Task Proof screenshot's Task. */
const proofTask = (details: { taskLabels: string[] }) => (details.taskLabels.length ? ` (${details.taskLabels.join(", ")})` : "");

/** The tiles a group of entries touched: `"A" and "B"`, or a count once there are more than three. */
function describeTiles(inputs: { details: { tileName: string | null } }[]): string {
  const names = [...new Set(inputs.map((i) => i.details.tileName).filter((n): n is string => !!n))];
  if (names.length === 0) return "a tile";
  return names.length <= 3 ? joinList(names.map((n) => `"${n}"`)) : `${names.length} tiles`;
}

/**
 * What a submission (or several) was for: "1 Armadyl crossbow", "3× Bandos hilt and 1 Armadyl crossbow",
 * "proof of Part B" for a manual task, or "a screenshot" when nothing is known (rows written before claims
 * were recorded). Item names are proper nouns, so they are never pluralised.
 */
export function describeClaims(details: { claims?: { itemName: string | null; quantity: number }[]; taskLabels?: string[] }): string {
  const claims = details.claims ?? [];
  const items = new Map<string, number>();
  let manualClaims = 0;
  for (const c of claims) {
    if (c.itemName) items.set(c.itemName, (items.get(c.itemName) ?? 0) + c.quantity);
    else manualClaims++;
  }
  const parts = [...items].map(([name, quantity]) => (quantity === 1 ? `1 ${name}` : `${quantity}× ${name}`));
  if (manualClaims > 0) {
    const labels = [...new Set(details.taskLabels ?? [])].slice(0, manualClaims);
    parts.push(labels.length > 0 ? `proof of ${joinList(labels)}` : "proof");
  }
  return parts.length > 0 ? joinList(parts) : "a screenshot";
}

const pointsFor = (d: PointChangeDetails) =>
  d.source === "task"
    ? `task points for "${d.nodeLabel}" on "${d.tileName ?? "a tile"}"`
    : d.source === "tile_bonus"
      ? `the tile bonus for completing all of "${d.nodeLabel}"`
      : `the line bonus for ${d.nodeLabel}`;

export const AUDIT_ACTIONS: { [A in AuditAction]: AuditActionDef<A> } = {
  "bingo.created": {
    category: "bingo",
    tone: "ok",
    visibility: "mods",
    title: "Bingo created",
    label: (i) => `${actor(i)} created the bingo "${i.details.name}"${i.details.source === "import" ? " (imported)" : ""}`,
  },
  "bingo.deleted": {
    category: "bingo",
    tone: "danger",
    visibility: "mods",
    title: "Bingo deleted",
    label: (i) => `${actor(i)} deleted the bingo "${i.details.name}"`,
  },
  "bingo.historical_imported": {
    category: "bingo",
    tone: "ok",
    visibility: "mods",
    title: "Historical Bingo imported",
    label: (i) => `${actor(i)} imported the historical Bingo "${i.details.name}" from ${i.details.source}`,
  },
  "bingo.historical_screenshots_attached": {
    category: "bingo",
    tone: "ok",
    visibility: "mods",
    title: "Historical screenshots attached",
    label: (i) => `${actor(i)} attached the last of the historical Bingo "${i.details.name}"'s ${i.details.screenshots} screenshots`,
  },
  "user.admin_changed": {
    category: "moderation",
    tone: "warn",
    visibility: "mods",
    title: "Site admin changed",
    label: (i) => `${actor(i)} ${i.details.isAdmin.after ? "granted" : "revoked"} site admin for ${i.entityLabel ?? "a user"}`,
  },
  "item_group.created": {
    category: "system",
    tone: "neutral",
    visibility: "mods",
    title: "Item group created",
    label: (i) => `${actor(i)} created the item group "${i.details.name}"`,
  },
  "item_group.updated": {
    category: "system",
    tone: "neutral",
    visibility: "mods",
    title: "Item group updated",
    label: (i) => `${actor(i)} updated the item group "${i.entityLabel ?? ""}"`,
  },
  "item_group.deleted": {
    category: "system",
    tone: "danger",
    visibility: "mods",
    title: "Item group deleted",
    label: (i) => `${actor(i)} deleted the item group "${i.details.name}"`,
  },
  "title_settings.updated": {
    category: "settings",
    tone: "neutral",
    visibility: "mods",
    title: "Title settings changed",
    label: (i) => {
      const keys = Object.keys(i.details.changes.after);
      const shown = keys.slice(0, 3).map((k) => `${k} ${settingValue(i.details.changes.before[k])} → ${settingValue(i.details.changes.after[k])}`);
      return `${actor(i)} changed the Title settings: ${shown.join(", ")}${keys.length > 3 ? ` and ${keys.length - 3} more` : ""}`;
    },
  },
  "piece_value.created": {
    category: "system",
    tone: "neutral",
    visibility: "mods",
    title: "Piece value added",
    label: (i) => {
      // Entries written before Other pieces existed have no otherPieces.
      const others = (i.details.otherPieces ?? []).map((o) => ` − ${o}`).join("");
      const whole = `${(i.details.wholeQuantity ?? 1) > 1 ? `${i.details.wholeQuantity}× ` : ""}${i.details.wholeItemName}`;
      // "÷ 1" is left off, and so are the brackets that would only group the subtraction for it.
      const divided = i.details.divisor > 1;
      const value = others && divided ? `(${whole}${others})` : `${whole}${others}`;
      return `${actor(i)} valued ${i.details.pieceItemName} as ${value}${divided ? ` ÷ ${i.details.divisor}` : ""}`;
    },
  },
  "piece_value.updated": {
    category: "system",
    tone: "neutral",
    visibility: "mods",
    title: "Piece value changed",
    label: (i) => `${actor(i)} changed the piece value of ${i.entityLabel ?? "an item"}`,
  },
  "piece_value.deleted": {
    category: "system",
    tone: "danger",
    visibility: "mods",
    title: "Piece value removed",
    label: (i) => `${actor(i)} removed the piece value of ${i.details.pieceItemName}`,
  },
  "piece_value.item_dismissed": {
    category: "system",
    tone: "neutral",
    visibility: "mods",
    title: "Unvalued item dismissed",
    label: (i) => `${actor(i)} left ${i.details.itemName} without a drop value`,
  },
  "piece_value.item_restored": {
    category: "system",
    tone: "neutral",
    visibility: "mods",
    title: "Unvalued item restored",
    label: (i) => `${actor(i)} put ${i.details.itemName} back on the unvalued items list`,
  },
  "wom_past_competition.added": {
    category: "system",
    tone: "ok",
    visibility: "mods",
    title: "Past WOM competition added",
    label: (i) => (i.details.source === "auto" ? `Archived the Wise Old Man competition "${i.details.title}"` : `${actor(i)} added the past Wise Old Man competition "${i.details.title}"`),
  },
  "wom_past_competition.renamed": {
    category: "system",
    tone: "neutral",
    visibility: "mods",
    title: "Past WOM competition renamed",
    label: (i) => `${actor(i)} renamed the past Wise Old Man competition "${i.details.from}" to "${i.details.to}"`,
  },
  "wom_past_competition.deleted": {
    category: "system",
    tone: "danger",
    visibility: "mods",
    title: "Past WOM competition deleted",
    label: (i) => `${actor(i)} deleted the past Wise Old Man competition "${i.details.title}"`,
  },
  "settings.updated": {
    category: "settings",
    tone: "neutral",
    visibility: "mods",
    title: "Settings updated",
    label: (i) =>
      `${actor(i)} updated bingo settings (${Object.keys(i.details.changes.after).map((k) => (k === "exclusivityRulesJson" ? "exclusive items" : k === "wrappedCreditsJson" ? "credits" : k)).join(", ") || "no changes"})`,
  },
  "moderator.added": {
    category: "moderation",
    tone: "ok",
    visibility: "mods",
    title: "Moderator added",
    label: (i) => `${actor(i)} made ${i.details.displayName} a moderator`,
  },
  "moderator.removed": {
    category: "moderation",
    tone: "warn",
    visibility: "mods",
    title: "Moderator removed",
    label: (i) => `${actor(i)} removed ${i.details.displayName} as a moderator`,
  },
  "staff.added": {
    category: "moderation",
    tone: "ok",
    visibility: "mods",
    title: "Staff added",
    label: (i) => `${actor(i)} made ${i.details.displayName} Staff`,
  },
  "staff.removed": {
    category: "moderation",
    tone: "warn",
    visibility: "mods",
    title: "Staff removed",
    label: (i) => `${actor(i)} removed ${i.details.displayName} as Staff`,
  },
  // Mods only: nobody but the restricted user, the Moderators and the Admins sees a Restriction (CONTEXT.md).
  "restriction.applied": {
    category: "moderation",
    tone: "danger",
    visibility: "mods",
    title: "Restriction applied",
    label: (i) => `${actor(i)} restricted ${i.details.displayName} from ${describeRestrictionTarget(i.details.action)}: "${i.details.reason}"`,
  },
  "restriction.lifted": {
    category: "moderation",
    tone: "ok",
    visibility: "mods",
    title: "Restriction lifted",
    label: (i) => `${actor(i)} lifted ${i.details.displayName}'s restriction on ${describeRestrictionTarget(i.details.action)} ("${i.details.reason}")`,
  },
  "category.created": { category: "board", tone: "ok", visibility: "mods", title: "Category created", label: (i) => `${actor(i)} created the category "${i.details.label}"` },
  "category.updated": { category: "board", tone: "neutral", visibility: "mods", title: "Category updated", label: (i) => `${actor(i)} updated the category "${i.entityLabel ?? ""}"` },
  "category.deleted": { category: "board", tone: "danger", visibility: "mods", title: "Category deleted", label: (i) => `${actor(i)} deleted the category "${i.details.label}"` },
  "tile.created": { category: "board", tone: "ok", visibility: "mods", title: "Tile created", label: (i) => `${actor(i)} created the tile "${i.details.name}"` },
  "tile.updated": { category: "board", tone: "neutral", visibility: "mods", title: "Tile updated", label: (i) => `${actor(i)} updated the tile "${i.entityLabel ?? ""}"` },
  "tile.deleted": { category: "board", tone: "danger", visibility: "mods", title: "Tile deleted", label: (i) => `${actor(i)} deleted the tile "${i.details.name}"` },
  "tile.bonus_points_updated": {
    category: "board",
    tone: "neutral",
    visibility: "mods",
    title: "Tile bonus points updated",
    label: (i) =>
      i.details.points.after > 0
        ? `${actor(i)} set "${i.entityLabel ?? ""}"'s full-completion bonus to ${i.details.points.after} pts`
        : `${actor(i)} removed "${i.entityLabel ?? ""}"'s full-completion bonus`,
  },
  // The tile's name can be missing: entries whose details went over the size cap before it kept the small fields.
  "task.created": { category: "board", tone: "ok", visibility: "mods", title: "Task created", label: (i) => `${actor(i)} added a task${onTile("to", i.details.tileName)}` },
  "task.updated": { category: "board", tone: "neutral", visibility: "mods", title: "Task updated", label: (i) => `${actor(i)} updated a task${onTile("on", i.details.tileName)}` },
  "task.deleted": { category: "board", tone: "danger", visibility: "mods", title: "Task deleted", label: (i) => `${actor(i)} deleted a task${onTile("from", i.details.tileName)}` },
  "line.generated": { category: "board", tone: "neutral", visibility: "mods", title: "Lines generated", label: (i) => `${actor(i)} regenerated bingo lines (${i.details.pointsPerLine} pts each)` },
  "line.updated": { category: "board", tone: "neutral", visibility: "mods", title: "Line updated", label: (i) => `${actor(i)} changed ${i.details.lineType} ${i.details.lineIndex + 1}'s points to ${i.details.points.after}` },
  "line.deleted": { category: "board", tone: "danger", visibility: "mods", title: "Line deleted", label: (i) => `${actor(i)} deleted ${i.details.lineType} ${i.details.lineIndex + 1}` },
  "question.created": { category: "signup", tone: "ok", visibility: "mods", title: "Question added", label: (i) => `${actor(i)} added the ${formWord(i.details)} question "${i.details.prompt}"` },
  "question.updated": { category: "signup", tone: "neutral", visibility: "mods", title: "Question updated", label: (i) => `${actor(i)} updated the ${formWord(i.details)} question "${i.entityLabel ?? ""}"` },
  "question.deleted": { category: "signup", tone: "danger", visibility: "mods", title: "Question deleted", label: (i) => `${actor(i)} deleted the ${formWord(i.details)} question "${i.details.prompt}"${i.details.answersDeleted ? ` and ${i.details.answersDeleted} answer${i.details.answersDeleted === 1 ? "" : "s"} to it` : ""}` },
  "question.reordered": { category: "signup", tone: "neutral", visibility: "mods", title: "Questions reordered", label: (i) => `${actor(i)} reordered the ${formWord(i.details)} questions` },
  "superlative.category_created": { category: "superlative", tone: "ok", visibility: "mods", title: "Superlative category added", label: (i) => `${actor(i)} added the superlative category "${i.details.name}"` },
  "superlative.category_updated": { category: "superlative", tone: "neutral", visibility: "mods", title: "Superlative category updated", label: (i) => `${actor(i)} renamed the superlative category "${i.entityLabel ?? ""}" to "${i.details.changes.after.name ?? ""}"` },
  "superlative.category_deleted": { category: "superlative", tone: "danger", visibility: "mods", title: "Superlative category deleted", label: (i) => `${actor(i)} deleted the superlative category "${i.details.name}"${i.details.votesDeleted ? ` and ${i.details.votesDeleted} vote${i.details.votesDeleted === 1 ? "" : "s"} in it` : ""}` },
  "superlative.category_reordered": { category: "superlative", tone: "neutral", visibility: "mods", title: "Superlative categories reordered", label: (i) => `${actor(i)} reordered the superlative categories` },
  "team.created": { category: "team", tone: "ok", visibility: "team", title: "Team created", label: (i) => `${actor(i)} created the team "${i.details.name}"` },
  "team.updated": {
    category: "team",
    tone: "neutral",
    visibility: "team",
    title: "Team updated",
    label: (i) =>
      i.details.changes.after.name
        ? `${actor(i)} renamed ${i.details.changes.before.name ?? i.entityLabel ?? "the team"} to "${i.details.changes.after.name}"${onBehalf(i)}`
        : `${actor(i)} updated ${i.teamName ?? i.entityLabel ?? "the team"}${onBehalf(i)}`,
  },
  "team.member_added": {
    category: "team",
    tone: "ok",
    visibility: "team",
    title: "Team member added",
    label: (i) => `${actor(i)} added ${i.details.displayName} to ${i.teamName ?? "the team"}`,
    condense: (inputs) => `${actor(inputs[0]!)} added ${joinList([...inputs].reverse().map((i) => i.details.displayName))} to ${inputs[0]!.teamName ?? "the team"}`,
  },
  "team.member_removed": {
    category: "team",
    tone: "warn",
    visibility: "team",
    title: "Team member removed",
    label: (i) => {
      const handover = i.details.newCaptainName ? `; ${i.details.newCaptainName} is now Captain` : i.details.newCoCaptainName ? `; ${i.details.newCoCaptainName} is now co-captain` : "";
      const reason = i.details.reason ? ` (${i.details.reason})` : "";
      return `${actor(i)} removed ${i.details.displayName} from ${i.teamName ?? "the team"}${reason}${handover}`;
    },
  },
  "team.deleted": { category: "team", tone: "danger", visibility: "mods", title: "Team deleted", label: (i) => `${actor(i)} deleted the team "${i.details.name}"` },
  "team.tile_interest_set": {
    category: "team",
    tone: "neutral",
    visibility: "team",
    title: "Tile interest",
    label: (i) => (i.details.interested ? `${actor(i)} wants to do "${i.details.taskLabel}" on "${i.details.tileName}"` : `${actor(i)} is no longer on "${i.details.taskLabel}" (${i.details.tileName})`),
  },
  "submission.created": {
    category: "submission",
    tone: "info",
    visibility: "team",
    title: "Submission created",
    // The audit entry's own "on behalf of" is the player the drop belongs to, when someone else posted it.
    label: (i) =>
      i.details.kind === "proof"
        ? `${actor(i)} posted a Proof screenshot for "${i.details.tileName}"${proofTask(i.details)}${onBehalf(i)}`
        : `${actor(i)} submitted ${describeClaims(i.details)} for "${i.details.tileName}"${onBehalf(i)}`,
    condense: (inputs) => {
      if (inputs.every((i) => i.details.kind === "proof")) return `${actor(inputs[0]!)} posted ${nSubmissions(inputs)} for ${describeTiles(inputs)}`;
      const sameOwner = new Set(inputs.map((i) => i.onBehalfOfName ?? "")).size === 1; // only when they were all for the same player
      return `${actor(inputs[0]!)} submitted ${describeClaims({ claims: inputs.flatMap((i) => i.details.claims), taskLabels: inputs.flatMap((i) => i.details.taskLabels) })} for ${describeTiles(inputs)}${sameOwner ? onBehalf(inputs[0]!) : ""}`;
    },
  },
  "submission.reaction_set": {
    category: "submission",
    tone: "neutral",
    visibility: "team",
    title: "Reaction",
    label: (i) => {
      const whose = i.details.ownSubmission ? "their own" : i.details.submitterName ? `${i.details.submitterName}'s` : "a";
      const what = `${whose} submission${i.details.tileName ? ` for "${i.details.tileName}"` : ""}`;
      return i.details.reacted ? `${actor(i)} reacted with ${i.details.reaction} to ${what}` : `${actor(i)} took their ${i.details.reaction} off ${what}`;
    },
    condense: (inputs) => `${actor(inputs[0]!)} changed their reactions on ${describeTiles(inputs)}`,
  },
  "submission.approved": {
    category: "submission",
    tone: "ok",
    visibility: "team",
    title: "Submission approved",
    label: (i) => `${actor(i)} approved ${aSubmission(i.details)} for "${i.details.tileName ?? "a tile"}"`,
    condense: (inputs) => `${actor(inputs[0]!)} approved ${nSubmissions(inputs)} for ${describeTiles(inputs)}`,
  },
  "submission.rejected": {
    category: "submission",
    tone: "danger",
    visibility: "team",
    title: "Submission rejected",
    label: (i) => `${actor(i)} rejected ${aSubmission(i.details)} for "${i.details.tileName ?? "a tile"}"`,
    condense: (inputs) => `${actor(inputs[0]!)} rejected ${nSubmissions(inputs)} for ${describeTiles(inputs)}`,
  },
  "submission.review_undone": {
    category: "submission",
    tone: "warn",
    visibility: "team",
    title: "Review undone",
    label: (i) =>
      `${actor(i)} sent a${i.details.previousStatus === "approved" ? "n approved" : " rejected"} ${i.details.kind === "proof" ? "Proof screenshot" : "submission"} for "${i.details.tileName ?? "a tile"}" back to pending`,
  },
  "submission.attribution_changed": {
    category: "submission",
    tone: "warn",
    visibility: "team",
    title: "Submission credit changed",
    label: (i) => `${actor(i)} changed who ${aSubmission(i.details)} for "${i.details.tileName ?? "a tile"}" is credited to, from ${i.details.fromName} to ${i.details.toName}`,
  },
  "submission.repriced": {
    category: "submission",
    tone: "warn",
    visibility: "mods",
    title: "Submission re-priced",
    label: (i) => `${actor(i)} re-priced the drop value of a submission for "${i.details.tileName ?? "a tile"}" (${i.details.claims.map((c) => c.itemName).join(", ")})`,
  },
  "submission.screenshot_analyzed": {
    category: "submission",
    tone: "neutral",
    visibility: "mods",
    title: "Screenshot analyzed",
    label: (i) => `Screenshot analysis: codeword ${i.details.codewordVerified ? "found" : "not found"}${i.details.detectedItemName ? `, detected "${i.details.detectedItemName}"` : ""}`,
  },
  "submission.screenshot_analysis_failed": { category: "submission", tone: "warn", visibility: "mods", title: "Screenshot analysis failed", label: () => "Screenshot analysis failed" },
  "points.adjusted": {
    category: "points",
    tone: "info",
    visibility: "team",
    title: "Points adjusted",
    label: (i) => `${actor(i)} adjusted ${i.teamName ?? "the team"}'s points by ${i.details.amount > 0 ? "+" : ""}${i.details.amount} (${i.details.reason})`,
  },
  "points.earned": {
    category: "points",
    tone: "ok",
    visibility: "team",
    title: "Points earned",
    label: (i) => `${i.teamName ?? "The team"} earned +${i.details.points} pts: ${pointsFor(i.details)}`,
  },
  "points.lost": {
    category: "points",
    tone: "warn",
    visibility: "team",
    title: "Points lost",
    label: (i) => `${i.teamName ?? "The team"} lost ${i.details.points} pts: ${pointsFor(i.details)} (no longer complete)`,
  },
  "points.rescored": {
    category: "points",
    tone: "info",
    visibility: "team",
    title: "Points re-scored",
    label: (i) => `${i.teamName ?? "The team"}'s points changed by ${i.details.delta > 0 ? "+" : ""}${i.details.delta} after a board change`,
  },
  "stage.changed": {
    category: "bingo",
    tone: "info",
    visibility: "public",
    title: "Stage changed",
    label: (i) => `${actor(i)} advanced the bingo from ${i.details.from} to ${i.details.to}`,
  },
  "wrapped.published": {
    category: "bingo",
    tone: "ok",
    visibility: "public",
    title: "Wrapped published",
    label: (i) => `${actor(i)} published Wrapped`,
  },
  "wrapped.republished": {
    category: "bingo",
    tone: "info",
    visibility: "public",
    title: "Wrapped re-published",
    label: (i) => `${actor(i)} published Wrapped again, with the latest numbers`,
  },
  "wrapped.art_set": {
    category: "settings",
    tone: "neutral",
    visibility: "mods",
    title: "Wrapped art set",
    label: (i) => `${actor(i)} ${i.details.replaced ? "replaced" : "added"} a Wrapped art image in "${i.details.section}"`,
  },
  "wrapped.art_recut": {
    category: "settings",
    tone: "neutral",
    visibility: "mods",
    title: "Wrapped art re-cut",
    label: (i) => `${actor(i)} re-cut a Wrapped art image in "${i.details.section}"`,
  },
  "wrapped.art_removed": {
    category: "settings",
    tone: "neutral",
    visibility: "mods",
    title: "Wrapped art removed",
    label: (i) => `${actor(i)} removed a Wrapped art image from "${i.details.section}"`,
  },
  "wrapped.art_reordered": {
    category: "settings",
    tone: "neutral",
    visibility: "mods",
    title: "Wrapped art reordered",
    label: (i) => `${actor(i)} reordered the Wrapped art in "${i.details.section}"`,
  },
  "wrapped.art_credit_set": {
    category: "settings",
    tone: "neutral",
    visibility: "mods",
    title: "Wrapped art credit set",
    label: (i) => (i.details.name ? `${actor(i)} credited a Wrapped art image in "${i.details.section}" to ${i.details.name}` : `${actor(i)} cleared a Wrapped art image's credit in "${i.details.section}"`),
  },
  "wrapped.credits_set": {
    category: "settings",
    tone: "neutral",
    visibility: "mods",
    title: "Wrapped credits set",
    label: (i) => `${actor(i)} set the additional credits in "${i.details.section}" (${i.details.count})`,
  },
  "draft.started": { category: "draft", tone: "info", visibility: "public", title: "Draft started", label: (i) => `${actor(i)} started the draft` },
  "draft.order_shuffled": { category: "draft", tone: "info", visibility: "public", title: "Pick order shuffled", label: (i) => `${actor(i)} shuffled the pick order` },
  "draft.order_set": { category: "draft", tone: "info", visibility: "public", title: "Pick order set", label: (i) => `${actor(i)} set the pick order` },
  "draft.pick": {
    category: "draft",
    tone: "neutral",
    visibility: "team",
    title: "Draft pick",
    label: (i) => `${actor(i)} drafted ${i.details.displayNames.join(" & ")}${onBehalf(i)}`,
  },
  "draft.pick_undone": {
    category: "draft",
    tone: "warn",
    visibility: "team",
    title: "Draft pick undone",
    label: (i) => `${actor(i)} undid the pick of ${i.details.displayNames.join(" & ")}`,
  },
  // Ratings and notes are logged apart ("Cosmic updated Green team's notes for A and B"), and only ever say that one
  // changed, never the stars or the note's text: those are the captains' private opinions about players.
  "draft.rating_set": {
    category: "draft",
    tone: "neutral",
    visibility: "team",
    title: "Pick rated",
    label: (i) =>
      `${actor(i)} ${i.details.cleared ? "cleared" : "updated"} ${teamPossessive(i)} rating for ${ratedNames(i.details)}${!i.details.names && i.details.hasNote ? " with a note" : ""}`,
  },
  "draft.note_set": {
    category: "draft",
    tone: "neutral",
    visibility: "team",
    title: "Pick note",
    label: (i) => `${actor(i)} ${i.details.cleared ? "cleared" : "updated"} ${teamPossessive(i)} notes for ${ratedNames(i.details)}`,
  },
  "draft.cut_review_applied": {
    category: "draft",
    tone: "info",
    visibility: "mods",
    title: "Cut review applied",
    label: (i) => {
      const count = (i.details.applied ?? i.details.changes ?? []).length;
      return count === 0
        ? `${actor(i)} reviewed cuts and kept them as they stand (${i.details.cutPlayersNow} cut)`
        : `${actor(i)} applied a Cut review (${count} change${count === 1 ? "" : "s"}, ${i.details.cutPlayersNow} → ${i.details.cutPlayers} cut)`;
    },
  },
  "pairing.requested": { category: "signup", tone: "neutral", visibility: "mods", title: "Duo pairing requested", label: (i) => `${actor(i)} requested a duo pairing` },
  "pairing.accepted": { category: "signup", tone: "ok", visibility: "mods", title: "Duo pairing accepted", label: (i) => `${actor(i)} accepted a duo pairing` },
  "pairing.declined": { category: "signup", tone: "warn", visibility: "mods", title: "Duo pairing declined", label: (i) => `${actor(i)} declined a duo pairing` },
  "pairing.cancelled": { category: "signup", tone: "neutral", visibility: "mods", title: "Duo pairing cancelled", label: (i) => `${actor(i)} cancelled a duo pairing request` },
  "pairing.dissolved": {
    category: "signup",
    tone: "warn",
    visibility: "mods",
    title: "Duo pairing dissolved",
    label: (i) => `A duo pairing was dissolved${i.details.cause === "withdrawal" ? " (partner withdrew)" : ""}`,
  },
  "pairing.left": { category: "signup", tone: "warn", visibility: "mods", title: "Duo pairing left", label: (i) => `${actor(i)} left a duo pairing` },
  "pairing.admin_paired": { category: "signup", tone: "ok", visibility: "mods", title: "Duo pairing created by a mod", label: (i) => `${actor(i)} paired ${i.details.displayNames.join(" & ")}` },
  "pairing.unpaired": { category: "signup", tone: "warn", visibility: "mods", title: "Duo pairing split by a mod", label: (i) => `${actor(i)} split up ${i.details.displayNames.join(" & ")}` },
  "signup.created": { category: "signup", tone: "ok", visibility: "mods", title: "Signup created", label: (i) =>
      i.onBehalfOfName
        ? `${actor(i)} signed ${i.onBehalfOfName} up late as ${i.details.rsn}${i.details.reactivated ? " (re-signup)" : ""}`
        : `${actor(i)} signed up as ${i.details.rsn}${i.details.reactivated ? " (re-signup)" : ""}`,
  },
  "signup.updated": {
    category: "signup",
    tone: "neutral",
    visibility: "mods",
    title: "Signup updated",
    label: (i) => {
      // Newer entries name what changed (the details hold the before/after); older ones only knew the RSN.
      const fields = Object.keys(i.details.changes?.after ?? {}).map((f) => (f === "RSN" ? `RSN → ${i.details.changes!.after.RSN}` : f));
      if (fields.length > 0) return `${actor(i)} updated their signup: ${fields.join(", ")}`;
      return `${actor(i)} updated their signup${i.details.rsn ? ` (RSN → ${i.details.rsn.after})` : ""}`;
    },
  },
  "signup.timezone_set": {
    category: "signup",
    tone: "neutral",
    visibility: "mods",
    title: "Timezone set by a mod",
    label: (i) => `${actor(i)} ${i.details.after ? `set ${i.onBehalfOfName ?? i.entityLabel ?? "a player"}'s timezone to ${i.details.after}` : `cleared ${i.onBehalfOfName ?? i.entityLabel ?? "a player"}'s timezone`}`,
  },
  "signup.withdrawn": {
    category: "signup",
    tone: "warn",
    visibility: "mods",
    title: "Signup withdrawn",
    label: (i) => (i.onBehalfOfName ? `${actor(i)} withdrew ${i.onBehalfOfName}'s signup (${i.details.rsn})` : `${actor(i)} withdrew their signup (${i.details.rsn})`),
  },
  "signup.buyin_marked": {
    category: "signup",
    tone: "ok",
    visibility: "mods",
    title: "Buy-in updated",
    label: (i) => `${actor(i)} marked buy-in ${i.details.received ? "received" : "not received"} for ${i.entityLabel ?? "a signup"}`,
  },
  "signup.stats_fetched": { category: "system", tone: "neutral", visibility: "mods", title: "Player stats fetched", label: (i) => `Fetched WOM/RuneProfile stats for ${i.entityLabel ?? "a signup"}` },
  "signup.stats_fetch_failed": { category: "system", tone: "warn", visibility: "mods", title: "Player stats fetch failed", label: (i) => `Failed to fetch player stats for ${i.entityLabel ?? "a signup"}` },
  "signup.name_changed": {
    category: "signup",
    tone: "info",
    visibility: "mods",
    title: "Name change",
    label: (i) => `${i.details.before} changed their name to ${i.details.after}`,
  },
  "wom.competition_created": { category: "system", tone: "ok", visibility: "mods", title: "WOM competition created", label: () => "Created the Wise Old Man competition" },
  "wom.roster_synced": {
    category: "system",
    tone: "neutral",
    visibility: "mods",
    title: "WOM competition synced",
    label: (i) => {
      const what = { title: "name", startsAt: "start date", endsAt: "end date", teams: "teams" } as const;
      return i.details.changed?.length
        ? `Updated the Wise Old Man competition's ${joinList(i.details.changed.map((c) => what[c]))}`
        : "Synced the Wise Old Man competition roster";
    },
  },
  "wom.participants_updated": {
    category: "system",
    tone: "neutral",
    visibility: "mods",
    title: "WOM players updated",
    label: () => "Asked Wise Old Man to update every player in the competition",
  },
  "wom.sync_failed": { category: "system", tone: "warn", visibility: "mods", title: "WOM sync failed", label: (i) => `Wise Old Man ${i.details.operation} failed: ${i.details.message}` },
  "discord.synced": {
    category: "system",
    tone: "neutral",
    visibility: "mods",
    title: "Discord synced",
    label: (i) => {
      const d = i.details;
      const parts = [
        d.created.length ? `created ${joinList(d.created)}` : null,
        d.updated.length ? `updated ${joinList(d.updated)}` : null,
        d.deleted.length ? `deleted ${joinList(d.deleted)}` : null,
        d.membersAdded ? `gave ${d.membersAdded} ${d.membersAdded === 1 ? "player" : "players"} their team role` : null,
        d.membersRemoved ? `took the team role from ${d.membersRemoved} ${d.membersRemoved === 1 ? "player" : "players"}` : null,
      ].filter((p): p is string => !!p);
      return parts.length ? `Discord: ${parts.join("; ")}` : "Synced the teams to Discord";
    },
  },
  "discord.sync_failed": { category: "system", tone: "warn", visibility: "mods", title: "Discord sync failed", label: (i) => `Discord sync failed: ${i.details.message}` },
  "discord.removed": { category: "system", tone: "warn", visibility: "mods", title: "Discord removed", label: (i) => `Removed ${i.details.deleted} Discord roles and channels` },
  "mcp.tool_called": {
    category: "system",
    tone: "neutral",
    visibility: "mods",
    title: "Claude tool used",
    label: (i) => `${actor(i)} used ${i.details.tool} through ${i.details.clientName ?? "Claude"}`,
  },
  "mcp.connection_revoked": {
    category: "system",
    tone: "warn",
    visibility: "mods",
    title: "Claude connection revoked",
    label: (i) =>
      i.details.reason === "admin_removed"
        ? `Revoked ${i.details.ownerName}'s ${i.details.clientName} connection: they're no longer a site admin`
        : i.details.byOwner
          ? `${actor(i)} revoked their ${i.details.clientName} connection`
          : `${actor(i)} revoked ${i.details.ownerName}'s ${i.details.clientName} connection`,
  },
  "http.mutation": {
    category: "http",
    tone: "warn",
    visibility: "mods",
    title: "Unaudited action",
    label: (i) => `${actor(i)} performed ${i.details.method} ${i.details.routePath ?? i.details.originalUrl} (not yet instrumented)`,
  },
  "bug_report.created": {
    category: "bug_report",
    tone: "warn",
    visibility: "mods",
    title: "Bug report submitted",
    label: (i) => `${actor(i)} reported a bug: "${i.details.description.length > 60 ? `${i.details.description.slice(0, 60)}…` : i.details.description}"`,
  },
  "bug_report.status_changed": {
    category: "bug_report",
    tone: "ok",
    visibility: "mods",
    title: "Bug report status changed",
    label: (i) => `${actor(i)} marked a bug report ${i.details.status === "resolved" ? "fixed" : i.details.status === "closed" ? "closed" : "reopened"}`,
  },
  "achievement.earned": {
    category: "achievement",
    tone: "ok",
    visibility: "mods",
    title: "Achievement earned",
    label: (i) => `${actor(i)} earned "${i.details.name}"`,
  },
};

export function actionsInCategory(category: AuditCategory): AuditAction[] {
  return (Object.keys(AUDIT_ACTIONS) as AuditAction[]).filter((a) => AUDIT_ACTIONS[a].category === category);
}

// ---------------------------------------------------------------------------
// API shapes
// ---------------------------------------------------------------------------

export interface AuditEntry {
  id: number;
  bingoId: string | null;
  /** ISO, ms precision. */
  at: string;
  action: AuditAction;
  category: AuditCategory;
  label: string;
  tone: AuditTone;
  visibility: AuditVisibility;
  actor: MinimalUser | null;
  actorType: AuditActorType;
  actorRole: AuditActorRole;
  onBehalfOf: MinimalUser | null;
  entityType: AuditEntityType;
  entityId: string | null;
  entityLabel: string | null;
  team: { id: string; name: string; color: string | null } | null;
  requestId: string | null;
  details: unknown;
  /** Present only on an entry that stands for several (see condenseAuditEntries): how many, which rows, and when the oldest happened. */
  condensed?: { count: number; ids: number[]; oldestAt: string };
}

export interface AuditLogResponse {
  entries: AuditEntry[];
  nextCursor: number | null;
}

export interface AuditLogFilters {
  action?: AuditAction[];
  category?: AuditCategory[];
  actorUserId?: string[];
  teamId?: string[];
  entityType?: AuditEntityType;
  entityId?: string;
  visibility?: AuditVisibility;
  since?: string;
  until?: string;
  q?: string;
}

/** Renders an entry's label at read time from its (self-contained) details — the server does this once, but the client can too (CSV export, headless models). */
export function renderAuditLabel(entry: AuditLabelSource): string {
  const def = AUDIT_ACTIONS[entry.action] as AuditActionDef<AuditAction>;
  return def.label(toAuditLabelInput(entry));
}

export type AuditLabelSource = Pick<AuditEntry, "action" | "details" | "entityLabel" | "actor" | "team" | "onBehalfOf">;

/** The names and details a label renderer works from, resolved from an entry. */
export function toAuditLabelInput(entry: AuditLabelSource): AuditLabelInput<AuditAction> {
  const name = (u: MinimalUser) => playerName(u);
  return {
    details: entry.details as never,
    entityLabel: entry.entityLabel,
    actorName: entry.actor ? name(entry.actor) : null,
    teamName: entry.team?.name ?? null,
    onBehalfOfName: entry.onBehalfOf ? name(entry.onBehalfOf) : null,
  };
}
