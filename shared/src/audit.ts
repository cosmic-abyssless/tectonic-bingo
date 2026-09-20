// Ubiquitous audit log — types + action registry shared by server and
// client. See docs/audit-log-plan.md for the full design.
//
// AuditDetailsMap has one key per audited action; AUDIT_ACTIONS must define
// every key in that map (enforced by the `Record<AuditAction, ...>` type
// below) — adding an action without both is a compile error. This is the
// compile-time half of "a new action can't silently escape the log" (the
// other two are the server's routeCoverage test and the http.mutation
// fallback — see server/src/audit/routePolicy.ts and middleware.ts).
import type { MinimalUser, Stage } from "./index.ts";
import { playerName } from "./names.ts";

export type AuditVisibility = "mods" | "team" | "public";
export type AuditActorType = "user" | "system" | "dev";
export type AuditActorRole = "admin" | "mod" | "player" | "system";
// Matches client/src/core/ui/Card.tsx's Badge TONE keys.
export type AuditTone = "neutral" | "info" | "ok" | "warn" | "danger";

export type AuditCategory = "bingo" | "settings" | "board" | "signup" | "draft" | "team" | "submission" | "points" | "moderation" | "system" | "http" | "bug_report";

export type AuditEntityType =
  | "bingo"
  | "user"
  | "item_group"
  | "category"
  | "tile"
  | "node"
  | "line"
  | "question"
  | "team"
  | "submission"
  | "adjustment"
  | "signup"
  | "pairing"
  | "http"
  | "bug_report";

/** Changed fields only — before/after per key, never a full row snapshot. */
export type FieldChanges<T> = { before: Partial<T>; after: Partial<T> };

// ---------------------------------------------------------------------------
// Per-action details shapes
// ---------------------------------------------------------------------------

export interface AuditDetailsMap {
  "bingo.created": { slug: string; name: string; theme: string; boardRows: number; boardCols: number; source: "form" | "import" };
  "bingo.deleted": { slug: string; name: string; stage: Stage; counts: { teams: number; signups: number; submissions: number } };

  "user.admin_changed": { isAdmin: { before: boolean; after: boolean }; source: "admin_panel" | "env_bootstrap" };

  "item_group.created": { name: string; itemCount: number };
  "item_group.updated": { changes: FieldChanges<{ name: string; description: string | null }>; items: { added: string[]; removed: string[] } };
  "item_group.deleted": { name: string; itemNames: string[] };

  "settings.updated": {
    changes: FieldChanges<{
      name: string;
      description: string | null;
      theme: string;
      signupMode: string;
      leftoverMode: string;
      warnLeftovers: boolean;
      buyinAmount: number | null;
      bonusPotAmount: number;
      rulesMarkdown: string | null;
      exclusivityRulesJson: string;
      signupOpensAt: string | null;
      draftScheduledAt: string | null;
      revealScheduledAt: string | null;
      startsAt: string | null;
      endsAt: string | null;
      womEnabled: boolean;
      womGroupId: string | null;
      womGroupVerificationCode: string;
    }>;
  };

  "moderator.added": { userId: string; displayName: string };
  "moderator.removed": { userId: string; displayName: string };

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

  "question.created": { prompt: string; type: string; required: boolean };
  "question.updated": { changes: FieldChanges<{ prompt: string; type: string; optionsJson: string | null; required: boolean; sortOrder: number }> };
  "question.deleted": { prompt: string; type: string; required: boolean };
  "question.reordered": { order: string[] };

  "team.created": { name: string; captainUserId: string; captainName: string; coCaptainUserId: string | null; coCaptainName: string | null; color: string | null };
  "team.updated": { changes: FieldChanges<{ name: string; color: string | null }>; codeword?: { changed: true } };
  "team.member_added": { userId: string; displayName: string };
  "team.member_removed": { userId: string; displayName: string };
  "team.deleted": { name: string; captainName: string; memberCount: number };
  "team.tile_interest_set": { tileName: string; taskLabel: string; interested: boolean };

  "submission.created": { tileId: string; tileName: string; taskLabels: string[]; claims: { nodeId: string; itemName: string | null; quantity: number }[]; screenshotUrl: string };
  "submission.approved": { tileName: string | null; taskLabels: string[]; nodeIds: string[]; newlyCompletedNodeIds: string[]; pointsDelta: number; reviewerNotes: string | null; submittedByUserId: string };
  "submission.rejected": { tileName: string | null; taskLabels: string[]; nodeIds: string[]; reviewerNotes: string | null; submittedByUserId: string };
  "submission.review_undone": {
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
  "submission.attribution_changed": { tileName: string | null; taskLabels: string[]; fromUserId: string; fromName: string; toUserId: string; toName: string };
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

  "draft.started": { order: { teamId: string; name: string; draftOrder: number }[] };
  "draft.order_shuffled": { order: { teamId: string; name: string; draftOrder: number }[] };
  "draft.order_set": { order: { teamId: string; name: string; draftOrder: number }[] };
  "draft.pick": { pickNumber: number; userIds: string[]; displayNames: string[]; pair: boolean };
  "draft.rating_set": { rsn: string; stars: number; hasNote: boolean; cleared: boolean };

  "pairing.requested": { requesterUserId: string; targetDiscordId: string };
  "pairing.accepted": { requesterUserId: string; targetDiscordId: string; partnerUserId: string | null };
  "pairing.declined": { requesterUserId: string; targetDiscordId: string };
  "pairing.cancelled": { requesterUserId: string; targetDiscordId: string };
  "pairing.dissolved": { requesterUserId: string; targetDiscordId: string; cause?: "withdrawal" };
  "pairing.admin_paired": { userIds: string[]; displayNames: string[] };
  "pairing.unpaired": { userIds: string[]; displayNames: string[] };

  "signup.created": { rsn: string; rsnVerified: boolean; answerCount: number; reactivated: boolean };
  "signup.updated": { rsn?: { before: string; after: string }; rsnVerified?: boolean; answersChanged: string[] };
  "signup.withdrawn": { rsn: string };
  "signup.buyin_marked": { received: boolean; collectedByUserId: string | null; collectedByName: string | null; before: { receivedAt: string | null } };
  "signup.stats_fetched": { womFound: boolean; runeProfileFound: boolean };
  "signup.stats_fetch_failed": { message: string };

  "wom.competition_created": { competitionId: number };
  "wom.roster_synced": Record<string, never>;
  "wom.sync_failed": { operation: "create" | "rename"; message: string };

  "dev.signups_seeded": { count: number; source: string };
  "dev.signups_wiped": { deleted: number };

  // Fallback-only: written by the server's finish-middleware for any
  // successful non-GET /api/* mutation that recorded nothing itself.
  "http.mutation": { method: string; originalUrl: string; routePath: string | null; params: Record<string, unknown>; body: unknown; file: string | null };

  "bug_report.created": { description: string; pageUrl: string | null; palette: string | null };
  "bug_report.resolved": { resolved: boolean };
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
const onBehalf = (i: { onBehalfOfName: string | null }) => (i.onBehalfOfName ? ` (on behalf of ${i.onBehalfOfName})` : "");
/** "a, b and c". */
function joinList(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

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
  "settings.updated": {
    category: "settings",
    tone: "neutral",
    visibility: "mods",
    title: "Settings updated",
    label: (i) =>
      `${actor(i)} updated bingo settings (${Object.keys(i.details.changes.after).map((k) => (k === "exclusivityRulesJson" ? "exclusive items" : k)).join(", ") || "no changes"})`,
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
  "task.created": { category: "board", tone: "ok", visibility: "mods", title: "Task created", label: (i) => `${actor(i)} added a task to "${i.details.tileName}"` },
  "task.updated": { category: "board", tone: "neutral", visibility: "mods", title: "Task updated", label: (i) => `${actor(i)} updated a task on "${i.details.tileName}"` },
  "task.deleted": { category: "board", tone: "danger", visibility: "mods", title: "Task deleted", label: (i) => `${actor(i)} deleted a task from "${i.details.tileName}"` },
  "line.generated": { category: "board", tone: "neutral", visibility: "mods", title: "Lines generated", label: (i) => `${actor(i)} regenerated bingo lines (${i.details.pointsPerLine} pts each)` },
  "line.updated": { category: "board", tone: "neutral", visibility: "mods", title: "Line updated", label: (i) => `${actor(i)} changed ${i.details.lineType} ${i.details.lineIndex + 1}'s points to ${i.details.points.after}` },
  "line.deleted": { category: "board", tone: "danger", visibility: "mods", title: "Line deleted", label: (i) => `${actor(i)} deleted ${i.details.lineType} ${i.details.lineIndex + 1}` },
  "question.created": { category: "signup", tone: "ok", visibility: "mods", title: "Signup question added", label: (i) => `${actor(i)} added the signup question "${i.details.prompt}"` },
  "question.updated": { category: "signup", tone: "neutral", visibility: "mods", title: "Signup question updated", label: (i) => `${actor(i)} updated the signup question "${i.entityLabel ?? ""}"` },
  "question.deleted": { category: "signup", tone: "danger", visibility: "mods", title: "Signup question deleted", label: (i) => `${actor(i)} deleted the signup question "${i.details.prompt}"` },
  "question.reordered": { category: "signup", tone: "neutral", visibility: "mods", title: "Signup questions reordered", label: (i) => `${actor(i)} reordered the signup questions` },
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
  "team.member_removed": { category: "team", tone: "warn", visibility: "team", title: "Team member removed", label: (i) => `${actor(i)} removed ${i.details.displayName} from ${i.teamName ?? "the team"}` },
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
    label: (i) => `${actor(i)} submitted ${describeClaims(i.details)} for "${i.details.tileName}"${onBehalf(i)}`,
    condense: (inputs) => {
      const sameOwner = new Set(inputs.map((i) => i.onBehalfOfName ?? "")).size === 1; // only when they were all for the same player
      return `${actor(inputs[0]!)} submitted ${describeClaims({ claims: inputs.flatMap((i) => i.details.claims), taskLabels: inputs.flatMap((i) => i.details.taskLabels) })} for ${describeTiles(inputs)}${sameOwner ? onBehalf(inputs[0]!) : ""}`;
    },
  },
  "submission.approved": {
    category: "submission",
    tone: "ok",
    visibility: "team",
    title: "Submission approved",
    label: (i) => `${actor(i)} approved a submission for "${i.details.tileName ?? "a tile"}"`,
    condense: (inputs) => `${actor(inputs[0]!)} approved ${inputs.length} submissions for ${describeTiles(inputs)}`,
  },
  "submission.rejected": {
    category: "submission",
    tone: "danger",
    visibility: "team",
    title: "Submission rejected",
    label: (i) => `${actor(i)} rejected a submission for "${i.details.tileName ?? "a tile"}"`,
    condense: (inputs) => `${actor(inputs[0]!)} rejected ${inputs.length} submissions for ${describeTiles(inputs)}`,
  },
  "submission.review_undone": {
    category: "submission",
    tone: "warn",
    visibility: "team",
    title: "Review undone",
    label: (i) =>
      `${actor(i)} sent a${i.details.previousStatus === "approved" ? "n approved" : " rejected"} submission for "${i.details.tileName ?? "a tile"}" back to pending`,
  },
  "submission.attribution_changed": {
    category: "submission",
    tone: "warn",
    visibility: "team",
    title: "Submission credit changed",
    label: (i) => `${actor(i)} changed who a submission for "${i.details.tileName ?? "a tile"}" is credited to, from ${i.details.fromName} to ${i.details.toName}`,
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
  "draft.rating_set": {
    category: "draft",
    tone: "neutral",
    visibility: "team",
    title: "Pick rated",
    label: (i) => (i.details.cleared ? `${actor(i)} cleared their rating of ${i.details.rsn}` : `${actor(i)} rated ${i.details.rsn} ${i.details.stars}/3${i.details.hasNote ? " with a note" : ""}`),
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
  "pairing.admin_paired": { category: "signup", tone: "ok", visibility: "mods", title: "Duo pairing created by a mod", label: (i) => `${actor(i)} paired ${i.details.displayNames.join(" & ")}` },
  "pairing.unpaired": { category: "signup", tone: "warn", visibility: "mods", title: "Duo pairing split by a mod", label: (i) => `${actor(i)} split up ${i.details.displayNames.join(" & ")}` },
  "signup.created": { category: "signup", tone: "ok", visibility: "mods", title: "Signup created", label: (i) => `${actor(i)} signed up as ${i.details.rsn}${i.details.reactivated ? " (re-signup)" : ""}` },
  "signup.updated": { category: "signup", tone: "neutral", visibility: "mods", title: "Signup updated", label: (i) => `${actor(i)} updated their signup${i.details.rsn ? ` (RSN → ${i.details.rsn.after})` : ""}` },
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
  "wom.competition_created": { category: "system", tone: "ok", visibility: "mods", title: "WOM competition created", label: () => "Created the Wise Old Man competition" },
  "wom.roster_synced": { category: "system", tone: "neutral", visibility: "mods", title: "WOM roster synced", label: () => "Synced the Wise Old Man competition roster" },
  "wom.sync_failed": { category: "system", tone: "warn", visibility: "mods", title: "WOM sync failed", label: (i) => `Wise Old Man ${i.details.operation} failed: ${i.details.message}` },
  "dev.signups_seeded": { category: "system", tone: "neutral", visibility: "mods", title: "Dev signups seeded", label: (i) => `${actor(i)} seeded ${i.details.count} test signups` },
  "dev.signups_wiped": { category: "system", tone: "warn", visibility: "mods", title: "Dev signups wiped", label: (i) => `${actor(i)} wiped ${i.details.deleted} signups` },
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
  "bug_report.resolved": {
    category: "bug_report",
    tone: "ok",
    visibility: "mods",
    title: "Bug report resolved",
    label: (i) => `${actor(i)} marked a bug report ${i.details.resolved ? "resolved" : "reopened"}`,
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
