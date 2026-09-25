// Types shared between client and server, matching the API's actual JSON
// shapes (dates arrive as ISO strings, not Date objects). Domain rows mirror
// server/src/db/schema.ts field-for-field; nest/derived shapes match what
// each route actually returns.
//
// Node-graph model (docs/node-graph-model.md): tiles, tasks, lines and
// requirements are all nodes in one per-bingo DAG. "Task" and "line" are not
// kinds — a task is a node that happens to be a direct child of a tile's
// node; a line is a node referenced by a BingoLine row. NodeStatus is
// derived at read time, never stored (see TeamNodeState).

import type { ExclusivityRule } from "./exclusivity.ts";
import type { AuditVisibility } from "./audit.ts";

export type Stage = "planning" | "signup" | "captains" | "draft" | "reveal" | "live" | "complete";
export const STAGE_ORDER: Stage[] = ["planning", "signup", "captains", "draft", "reveal", "live", "complete"];

// Play has started: team names and player ratings lock on this (see the server's
// bingoService.isBoardLocked).
export function isBoardLocked(stage: Stage): boolean {
  return stage === "live" || stage === "complete";
}

// The board itself (tiles, tasks, points, lines) stays editable through the live stage, so a mistake
// can be fixed mid-event, and is locked once the bingo is complete (mirrors the server's
// bingoService.assertBoardEditable).
export function isBoardEditingLocked(stage: Stage): boolean {
  return stage === "complete";
}

export const STAGE_LABEL: Record<Stage, string> = {
  planning: "Planning",
  signup: "Signups open",
  captains: "Signups closed",
  draft: "Draft",
  reveal: "Board revealed",
  live: "Live",
  complete: "Finished",
};

/** What players are waiting for while in `stage`, and the scheduled time if a mod set one. */
export interface StageMilestone {
  label: string;
  at: string | null;
}

export function nextMilestone(bingo: Pick<Bingo, "stage" | "signupOpensAt" | "draftScheduledAt" | "revealScheduledAt" | "startsAt" | "endsAt">): StageMilestone | null {
  switch (bingo.stage) {
    case "planning":
      return { label: "Signups open", at: bingo.signupOpensAt };
    case "signup":
    case "captains":
      return { label: "Draft", at: bingo.draftScheduledAt };
    case "draft":
      return { label: "Board reveal", at: bingo.revealScheduledAt };
    case "reveal":
      return { label: "Bingo starts", at: bingo.startsAt };
    case "live":
      return { label: "Bingo ends", at: bingo.endsAt };
    case "complete":
      return null;
  }
}

export type NodeStatus = "not_started" | "in_progress" | "pending_approval" | "completed";
export type SubmissionStatus = "pending" | "approved" | "rejected";

export interface User {
  id: string;
  discordId: string;
  discordUsername: string;
  discordGlobalName: string | null;
  discordGuildNick: string | null;
  discordAvatar: string | null;
  /**
   * The RSN this player signed up with in the bingo the response is about. The server sets it on the users it sends
   * inside a bingo (a roster, a submission, the stats, the audit log); it is absent on site-level lists, and for an
   * account with no signup in that bingo (a mod who isn't playing). See playerName.
   */
  rsn?: string | null;
  /** Was a member of the clan's Discord server at last login. */
  inGuild: boolean;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export const SIGNUP_MODES = ["solo", "duo"] as const;
export type SignupMode = (typeof SIGNUP_MODES)[number];

// Who makes the draft (bingos.cutMode), so the teams come out the same shape:
// - "even": every team drafts the same number of pairs and the same number of singles; the newest pairs and the
//   newest singles that don't split evenly across the teams are cut. (A solo bingo has only singles.)
// - "pairs_only" (duo bingos): every team drafts the same number of pairs; the newest pairs that don't split evenly,
//   and every single, are cut.
// - "none": everyone is drafted, in any order, and teams may come out uneven.
export const CUT_MODES = ["even", "pairs_only", "none"] as const;
export type CutMode = (typeof CUT_MODES)[number];

// The setting CutMode replaced, only still read from older export files: "cut" is now "even", "singles" is "none".
export type LeftoverMode = "cut" | "singles";

// Keep in sync with server/src/middleware/upload.ts (the server can't import this at runtime).
export const MAX_UPLOAD_MB = 5;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export interface Bingo {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  theme: string;
  stage: Stage;
  boardRows: number;
  boardCols: number;
  signupMode: SignupMode;
  cutMode: CutMode;
  // Tell signups at risk of being cut, on their signup page.
  warnLeftovers: boolean;
  buyinAmount: number | null;
  bonusPotAmount: number;
  rulesMarkdown: string | null;
  /** Items a team may use in one place only (see exclusivity.ts). */
  exclusivityRules: ExclusivityRule[];
  signupOpensAt: string | null;
  draftScheduledAt: string | null;
  revealScheduledAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  // Wise Old Man integration settings (see server/src/services/womCompetitionService.ts).
  // womGroupVerificationCode is intentionally absent — the server never
  // serializes it into a response (bingoService.toPublicBingo); the admin
  // settings form treats it as a write-only field.
  womEnabled: boolean;
  womGroupId: string | null;
  womCompetitionId: number | null;
  womSyncError: string | null;
  draftStarted: boolean;
  createdByUserId: string;
  createdAt: string;
}

export interface TileCategory {
  id: string;
  bingoId: string;
  label: string;
  colorHex: string | null;
  sortOrder: number;
}

export interface Team {
  id: string;
  bingoId: string;
  captainUserId: string;
  name: string;
  codeword: string;
  color: string | null;
  draftOrder: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamRosterEntry {
  user: User;
  isCaptain: boolean;
  isCoCaptain: boolean; // duo mode: captain's partner, shares captain permissions
  isDrafted: boolean; // joined via a draft pick, so mods can't remove them by hand
}

/** Team as shipped in the bingo shell: the row plus everyone on it. */
export interface TeamWithMembers extends Team {
  members: TeamRosterEntry[];
}

export interface ItemGroup {
  id: string;
  name: string;
  description: string | null;
  itemNames: string[];
}

/** A stored snapshot of one Wise Old Man competition's final results (issue #128). Never carries the raw participation data — this is a listing shape. */
export interface WomPastCompetition {
  id: string;
  guildId: string;
  womId: number;
  bingoId: string | null;
  title: string;
  metric: string;
  startsAt: string;
  endsAt: string;
  participantCount: number;
  fetchedAt: string;
  addedByUserId: string | null;
}

/** One stored past competition's result for a single player, matched by RSN (issue #128). */
export interface PastBingoParticipation {
  competitionId: string;
  womId: number;
  bingoId: string | null;
  title: string;
  metric: string;
  startsAt: string;
  endsAt: string;
  gained: number;
  /** 1-based place by gained among every participant in the competition. */
  totalRank: number;
  totalParticipants: number;
  /** Place among the player's own team, by gained. Null when the competition isn't tied to a bingo or the player wasn't on a team in it. */
  teamRank: number | null;
  teamSize: number | null;
}

export type NodeKind = "ALL" | "ANY" | "COUNT" | "SUM" | "ITEM" | "MANUAL";

// One node in a bingo's DAG. Composite kinds (ALL/ANY/COUNT/SUM) fold their
// children (see engine.ts); ITEM/MANUAL are leaves that claims attach to.
// Any node may carry points, gated by pointsGateNodeId/submitGateNodeId.
//
// ITEM is a single-name leaf: complete as soon as one approved claim targets
// it. Quantity always lives one level up — SUM sums approved-claim
// quantities across its ITEM children against its own `quantity` target;
// COUNT counts how many children are complete (also how "N distinct names"
// is expressed — COUNT(N) over N single-name leaves — see
// docs/item-quantity-model.md).
export interface GraphNode {
  id: string;
  bingoId: string;
  kind: NodeKind;
  label: string | null;
  description: string | null;
  notes: string | null;
  points: number;
  minCount: number | null; // COUNT only
  quantity: number | null; // SUM only
  itemName: string | null; // ITEM only
  /** This node's points stay 0 until the gate node also completes for the team. */
  pointsGateNodeId: string | null;
  /** Submissions targeting a leaf under this node are rejected until the gate node completes for the team. */
  submitGateNodeId: string | null;
  /** Display hint: player may submit an empty-state screenshot beforehand. */
  allowsPreLoad: boolean;
  /** In parent-relative sortOrder. Empty for leaves. */
  children: GraphNode[];
}

// Admin input shape for creating/replacing a subtree. `id` is optional and,
// when present, preserves an existing leaf's id so claims already pointing
// at it stay valid across an edit (see graphService.replaceSubtree). Picking
// an item group in the admin UI is a client-side expansion into several
// plain ITEM children (one per group member name) — there is no group
// reference on a node; see docs/item-quantity-model.md §6.
export interface GraphNodeInput {
  id?: string;
  kind: NodeKind;
  label?: string | null;
  description?: string | null;
  notes?: string | null;
  points?: number;
  minCount?: number;
  quantity?: number;
  itemName?: string | null;
  pointsGateNodeId?: string | null;
  submitGateNodeId?: string | null;
  allowsPreLoad?: boolean;
  children?: GraphNodeInput[];
}

// The raw tiles row, as returned unnested (e.g. in mod submission rows).
export interface TileBase {
  id: string;
  bingoId: string;
  nodeId: string;
  name: string;
  imageUrl: string | null;
  categoryId: string | null;
  boardRow: number;
  boardCol: number;
  hasFreezePeriod: boolean;
  freezeDurationMinutes: number;
  notes: string | null;
  createdAt: string;
}

export interface Tile extends TileBase {
  node: GraphNode;
}

export interface Submission {
  id: string;
  teamId: string;
  /** The player the drop belongs to (credited for it). */
  submittedByUserId: string;
  /** Who uploaded it, when that isn't the same player: a teammate at a PC, or a mod. */
  postedByUserId: string | null;
  status: SubmissionStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewerNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionScreenshot {
  id: string;
  submissionId: string;
  screenshotType: "main" | "pre_screenshot" | "bank" | "collection_log" | "other";
  storageUrl: string;
  scrapeStatus: "pending" | "processing" | "completed" | "failed";
  extractedText: string | null;
  codewordVerified: boolean | null;
  detectedItemName: string | null;
  scrapedAt: string | null;
  uploadedAt: string;
}

// One drop allocated to a requirement leaf. itemName is null for MANUAL leaves.
export interface Claim {
  id: string;
  submissionId: string;
  nodeId: string;
  itemName: string | null;
  quantity: number;
}

export type MinimalUser = Pick<User, "id" | "discordUsername" | "discordGlobalName" | "discordGuildNick" | "rsn">;

export interface SubmissionDetails {
  submission: Submission;
  screenshots: SubmissionScreenshot[];
  claims: Claim[];
  submittedByUser: MinimalUser | null;
  /** Set only when someone else posted it for `submittedByUser`. */
  postedByUser: MinimalUser | null;
}

/** `resolved` = fixed; `closed` = deliberately not implemented (usually with a reason in `resolutionMessage`). */
export type BugReportStatus = "open" | "resolved" | "closed";

// Submitted from the header button on any page. bingoId is a best-effort tag
// (resolved server-side from the reporter's page URL) — null when reported
// off-bingo (bingo list, site admin).
export interface BugReport {
  id: string;
  bingoId: string | null;
  reporterUserId: string;
  description: string;
  pageUrl: string | null;
  userAgent: string | null;
  /** The theme and palette the reporter was looking at, e.g. "comic · Blackout (dark, system)". Null on older reports. */
  palette: string | null;
  status: BugReportStatus;
  /** Whoever last moved it away from `open` (to resolved or closed). Null while open. */
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  /** Optional note from whoever resolved/closed it, shown to the reporter. Null while open or if reopened. */
  resolutionMessage: string | null;
  createdAt: string;
}

export interface BugReportWithReporter extends BugReport {
  reporter: MinimalUser | null;
  /** Whoever last moved it away from `open`, for attributing the resolutionMessage. Null while open. */
  resolvedByUser: MinimalUser | null;
}

// Minimal display info for a leaf a submission's claims touched — enough for
// the review queue to label each claim without fetching the whole board graph.
export interface ClaimedLeaf {
  id: string;
  kind: NodeKind;
  label: string | null;
}

export interface ModSubmissionRow extends SubmissionDetails {
  leaves: ClaimedLeaf[];
  tile: TileBase;
  team: Pick<Team, "id" | "name" | "color">;
}

// Derived cache: one row per node currently COMPLETE for a team (see
// engine.ts / graphService.rebuildTeamState). Soft statuses
// (in_progress/pending_approval) are never stored — the board read path
// derives them from the team's submissions.
export interface TeamNodeState {
  nodeId: string;
  completedAt: string;
  pointsAwarded: number;
}

export interface PointAdjustment {
  id: string;
  teamId: string;
  bingoId: string;
  amount: number;
  reason: string;
  createdByUserId: string;
  createdAt: string;
}

export interface TeamProgressSummary {
  nodeStates: TeamNodeState[];
  adjustments: PointAdjustment[];
  totalPoints: number;
  // Everyone on the team who has raised a hand for a part of a tile. Same
  // visibility as the rest of the team's progress.
  interests: TileInterest[];
}

/** A team member saying "I'll take this part" of a tile. */
export interface TileInterest {
  tileId: string;
  /** The task node (a direct child of the tile's root) the hand is raised on. */
  taskId: string;
  user: MinimalUser;
  createdAt: string;
}

export interface ScreenshotAnalysis {
  codewordFound: boolean;
  codeword: string;
  extractedText: string[];
  detectedMatch: { tileId: string; tileName: string; nodeId: string; itemName: string } | null;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// API response envelopes, matching routes/*.ts exactly
// ---------------------------------------------------------------------------

export interface BingoListResponse {
  bingos: Bingo[];
}

export interface BingoShellResponse {
  /**
   * `effectiveStartsAt`: when the bingo counts as started — the start date set in the settings, or if there is
   * none, when it was last put live (null if neither). Tile freezes and "submissions open" run from it.
   */
  bingo: Bingo & { effectiveStartsAt: string | null };
  categories: TileCategory[];
  teams: TeamWithMembers[];
  isMod: boolean;
  myTeam: Team | null;
  paidSignupCount: number;
  potTotal: number;
  // True once anyone has ever signed up; the signup mode is locked from then on.
  hasSignups: boolean;
}

export interface BoardLine extends BingoLine {
  node: GraphNode;
}

export interface BoardResponse {
  tiles: Tile[];
  lines: BoardLine[];
}

export interface TeamSubmissionsResponse {
  submissions: SubmissionDetails[];
}

export interface ModSubmissionsResponse {
  submissions: ModSubmissionRow[];
}

export interface PendingCountResponse {
  count: number;
}

export interface MeResponse {
  user: User;
  devMode: boolean;
}

export interface CreateSubmissionResponse {
  submission: Submission;
}

export interface CreatePointAdjustmentPayload {
  amount: number;
  reason: string;
}

export interface CreatePointAdjustmentResponse {
  adjustment: PointAdjustment;
}

export interface ClaimInput {
  nodeId: string;
  itemName?: string;
  quantity?: number;
}

export interface CreateSubmissionPayload {
  claims: ClaimInput[];
  screenshotUrl: string;
}

export interface ReviewSubmissionResponse {
  submission: Submission;
  /** Every leaf node the submission's claims touched. */
  nodeIds: string[];
  /** Nodes (any kind, anywhere in the graph) newly completed by this approval. Empty/absent on reject. */
  newlyCompletedNodeIds?: string[];
  /** Nodes that stopped being complete when an approval was undone. Absent on approve/reject. */
  uncompletedNodeIds?: string[];
  /** Net points change: positive on approve, zero or negative on undo, absent on reject. */
  pointsDelta?: number;
}

/**
 * "select" is a single choice (shown as radio buttons) and "multiselect" is any number of choices (checkboxes), both
 * from `optionsJson`. A multiselect answer is stored as a JSON list (see signupAnswers.ts).
 */
export type SignupQuestionType = "text" | "textarea" | "select" | "multiselect" | "boolean";

/**
 * Who, besides the player who answered, can see a question's answers: that level and up (captains < mods < admins).
 * "captains" is the default and means every role that sees answers at all (team leads in the draft, mods, admins).
 */
export const QUESTION_VISIBILITIES = ["captains", "mods", "admins"] as const;
export type QuestionVisibility = (typeof QUESTION_VISIBILITIES)[number];

/** The level someone looks at other players' answers from: a team lead, a bingo moderator, or a site admin. */
export type AnswerViewer = "captain" | "mod" | "admin";

const VISIBILITY_RANK: Record<QuestionVisibility, number> = { captains: 0, mods: 1, admins: 2 };
const VIEWER_RANK: Record<AnswerViewer, number> = { captain: 0, mod: 1, admin: 2 };

export function canSeeAnswers(visibility: QuestionVisibility, viewer: AnswerViewer): boolean {
  return VIEWER_RANK[viewer] >= VISIBILITY_RANK[visibility];
}

export interface SignupQuestion {
  id: string;
  bingoId: string;
  prompt: string;
  /** Plain text shown under the question on the signup form, when set. */
  helperText: string | null;
  type: SignupQuestionType;
  optionsJson: string | null;
  required: boolean;
  sortOrder: number;
  visibility: QuestionVisibility;
}

/** The longest helper text a question may carry. */
export const MAX_QUESTION_HELPER_TEXT = 500;

export type SignupStatus = "active" | "withdrawn";

export interface Signup {
  id: string;
  bingoId: string;
  userId: string;
  rsn: string;
  /** IANA zone name. Null on signups from before it was asked (until confirmed/set), and in the draft pool for anyone who can't see answers. */
  timezone: string | null;
  womId: string | null;
  rsnVerified: boolean;
  status: SignupStatus;
  buyinReceivedAt: string | null;
  buyinCollectedByUserId: string | null;
  buyinRecordedByUserId: string | null;
  createdAt: string;
}

export interface SignupAnswer {
  id: string;
  signupId: string;
  questionId: string;
  value: string;
}

export interface SignupAnswerInput {
  questionId: string;
  value: string;
}

export interface MySignupResponse {
  signup: Signup | null;
  answers: SignupAnswer[];
  // The bingo warns leftovers and this signup is currently one of them.
  atRisk: boolean;
  caCurrent: CombatAchievementStats | null;
  caPeak: CombatAchievementStats | null;
  // Null until the fire-and-forget WOM/RuneProfile fetch stamps the row —
  // the signup form uses this to tell Looking up apart from Unknown.
  statsFetchedAt: string | null;
}

// A tectonic-api-linked RSN.
export interface TectonicRsn {
  rsn: string;
  womId: string;
}

export interface MyTectonicRsnsResponse {
  // False when the integration isn't configured — isMember/rsns are
  // meaningless in that case and no membership gating should apply.
  enabled: boolean;
  // Only meaningful when enabled: true. False means the signer isn't a
  // registered member of the clan's tectonic-api guild (or the lookup
  // failed — tectonic-api never distinguishes the two).
  isMember: boolean;
  rsns: TectonicRsn[];
}

export interface RosterEntry {
  signup: Signup;
  user: User;
  answers: SignupAnswer[];
  // Only populated by the mod-facing roster (GET .../mod/signups) — who
  // marked buy-in received for this signup. Absent from other RosterEntry
  // uses like the captain-candidates list.
  collectedByUser?: User | null;
  // Duo mode, mod roster only: the accepted pairing this player is in.
  pairing?: SignupPairing | null;
  // Duo mode, mod roster only: this player's own outstanding request to pair with someone, before it's been
  // accepted/declined. `target` is resolved the same as MyPairingResponse's own `outgoing.target`.
  outgoingPairingRequest?: { pairing: SignupPairing; target: PairingParty } | null;
  // Mod roster only: undrafted and cut from the draft as things stand (see CutMode).
  cut?: boolean;
  // Mod roster only: clan standing from tectonic-api; null when the player
  // isn't registered there or the lookup was unavailable.
  tectonicProfile?: TectonicProfile | null;
  caCurrent?: CombatAchievementStats | null;
  caPeak?: CombatAchievementStats | null;
  womStats?: WomPlayerStats | null;
}

// ---------------------------------------------------------------------------
// Clan profile (tectonic-api GET /guilds/:id/users/:ids), trimmed to what the
// draft room and mod roster show. Fetched live, never persisted.
// ---------------------------------------------------------------------------

export interface TectonicProfile {
  points: number;
  rank: number; // 1-based standing in the clan by points
  tier: { name: string; icon: string | null } | null; // icon: URL, Discord emoji `<:name:id>`, or rank slug
  achievements: { name: string; thumbnail: string }[]; // sorted by display order
  records: TectonicProfileRecord[];
  events: { name: string; placement: number; solo: boolean }[]; // only placements that scored points
}

// A clan record the player currently holds (as runner or teammate) that still
// places on the clan leaderboard.
export interface TectonicProfileRecord {
  displayName: string; // boss/activity
  category: string;
  solo: boolean;
  valueType: string; // "time" (OSRS game ticks, 0.6s each) or "depth"
  value: number;
  date: string;
  teamSize: number;
  position: number; // 1 = clan best for that boss
}

// ---------------------------------------------------------------------------
// Duo signups
// ---------------------------------------------------------------------------

export type PairingStatus = "pending" | "accepted" | "declined" | "cancelled" | "dissolved" | "left";

export interface SignupPairing {
  id: string;
  bingoId: string;
  requesterUserId: string;
  targetDiscordId: string;
  status: PairingStatus;
  createdByUserId: string;
  createdAt: string;
  respondedAt: string | null;
}

// A clan member who can be requested as a duo partner. `user` is null until
// they've logged into the site, so the client falls back to the RSNs.
export interface PartnerCandidate {
  discordId: string;
  rsns: string[];
  user: MinimalUser | null;
}

export interface PartnerCandidatesResponse {
  candidates: PartnerCandidate[];
}

/** Someone signed up for a duo bingo who has no partner yet: who a player can still pair with. */
export interface UnpairedSignup {
  userId: string;
  discordId: string;
  rsn: string;
  /** They've asked someone to pair and are waiting on the reply (not who: that's between the two of them). */
  waiting: boolean;
}

export interface UnpairedSignupsResponse {
  players: UnpairedSignup[];
}

// One side of a pairing as the other side should see them. `user` is null
// until they've logged in; `rsn` is set once they've signed up for this bingo.
// `name` is what to show: signup RSN, else clan-roster RSN, else Discord name,
// else the raw Discord id.
export interface PairingParty {
  discordId: string;
  user: MinimalUser | null;
  rsn: string | null;
  name: string;
}

export interface MyPairingResponse {
  // Accepted pair, if any.
  partner: ({ pairing: SignupPairing } & PairingParty) | null;
  // The single pending request the player has made.
  outgoing: { pairing: SignupPairing; target: PairingParty } | null;
  // Pending requests made to the player.
  incoming: { pairing: SignupPairing; requester: PairingParty }[];
  // Why the player is currently unpaired: a partner declined (shown only to whoever was declined), a partner
  // withdrew their signup ("dissolved"), or either half ended the pairing directly while staying signed up
  // ("left" — shown to both, since the row doesn't record which of them it was).
  lastOutcome: { status: "declined" | "dissolved" | "left"; other: PairingParty } | null;
}

export interface RosterResponse {
  signups: RosterEntry[];
}

export interface CaptainCandidatesResponse {
  candidates: RosterEntry[];
}

// The raw bingo_lines row. Points live on the referenced node (see BoardLine).
export interface BingoLine {
  id: string;
  bingoId: string;
  nodeId: string;
  lineType: "row" | "column" | "diagonal" | "custom";
  lineIndex: number;
}

export interface BingoModerator {
  id: string;
  bingoId: string;
  userId: string;
  createdAt: string;
  user: User;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  isCaptain: boolean;
  joinedAt: string;
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

export interface DraftPick {
  id: string;
  bingoId: string;
  pickNumber: number;
  teamId: string;
  userId: string;
  pickedByUserId: string;
  createdAt: string;
  user: MinimalUser;
  rsn: string; // the drafted player's RSN for this bingo
}

export interface WomPlayerStats {
  ehb: number; // efficient hours bossed
  ehp: number; // efficient hours played
}

// Official OSRS Combat Achievement reward tier, derived from RuneProfile
// task completions (points + the Grandmaster all-tasks exception). Null on
// the wire means Unknown — no RuneProfile data — not the same as None (0 points).
export const COMBAT_ACHIEVEMENT_TIERS = ["none", "easy", "medium", "hard", "elite", "master", "grandmaster"] as const;
export type CombatAchievementTier = (typeof COMBAT_ACHIEVEMENT_TIERS)[number];

export const COMBAT_ACHIEVEMENT_TIER_LABEL: Record<CombatAchievementTier, string> = {
  none: "None",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  elite: "Elite",
  master: "Master",
  grandmaster: "Grandmaster",
};

export interface CombatAchievementStats {
  tier: CombatAchievementTier;
  points: number;
}

// Points at which each reward tier starts (OSRS wiki). Kept here so the client can place a player inside their tier.
export const CA_TIER_MIN_POINTS: Record<CombatAchievementTier, number> = {
  none: 0,
  easy: 41,
  medium: 169,
  hard: 436,
  elite: 1100,
  master: 1965,
  grandmaster: 2697,
};
export const CA_SUB_LEVELS = ["low", "medium", "high"] as const;
export type CombatAchievementSubLevel = (typeof CA_SUB_LEVELS)[number];

/**
 * Low/medium/high: which third of its tier's points range the player is in (Easy..Master run up to the next tier's
 * threshold). Grandmaster has no upper bound to split, and None and Unknown have no tier to be in: all null.
 */
export function caSubLevel(stats: CombatAchievementStats | null | undefined): CombatAchievementSubLevel | null {
  if (!stats || stats.tier === "none" || stats.tier === "grandmaster") return null;
  const start = CA_TIER_MIN_POINTS[stats.tier];
  const end = CA_TIER_MIN_POINTS[COMBAT_ACHIEVEMENT_TIERS[COMBAT_ACHIEVEMENT_TIERS.indexOf(stats.tier) + 1]!];
  const index = Math.floor(((stats.points - start) / (end - start)) * CA_SUB_LEVELS.length);
  return CA_SUB_LEVELS[Math.min(Math.max(index, 0), CA_SUB_LEVELS.length - 1)]!;
}

// Unified account type — sourced from RuneProfile when it has the player
// set up there (it distinguishes group ironman variants; WOM just reports
// "ironman" for a GIM member), falling back to WOM's coarser type when
// RuneProfile doesn't know the player (not everyone runs the RuneProfile
// RuneLite plugin, but WOM sync is far more common). WOM's four raw values
// (regular/ironman/hardcore/ultimate) map onto this same enum — see
// womService.ts's parseAccountType.
export type AccountType = "normal" | "ironman" | "ultimate_ironman" | "hardcore_ironman" | "group_ironman" | "hardcore_group_ironman" | "unranked_group_ironman" | "unknown";

export interface DraftPoolEntry {
  signup: Signup;
  user: MinimalUser;
  answers: SignupAnswer[] | null; // null unless the requester is a mod or captain
  // Null when signup.womId is unset, the WOM lookup failed, or the response
  // didn't have the fields expected — never distinguishes those cases.
  womStats: WomPlayerStats | null;
  // RuneProfile (by RSN) ?? WOM (by womId) ?? null. See AccountType.
  accountType: AccountType | null;
  // Official CA reward tier for the signed-up RSN. Null = Unknown (no RuneProfile).
  caCurrent: CombatAchievementStats | null;
  // Max CA reward tier across currently Tectonic-linked RSNs. Null = none of
  // those accounts have RuneProfile data. Never names the peak alt.
  caPeak: CombatAchievementStats | null;
  // Live clan standing; null when unregistered with the clan bot or when
  // tectonic-api was unavailable (see DraftState.tectonicUnavailable).
  tectonicProfile: TectonicProfile | null;
}

// GET /:slug/account-types: each active signup's account type by user id (players with none known are left out).
export interface AccountTypesResponse {
  accountTypes: Record<string, AccountType>;
}

// One player's card, opened from any name on the page (GET /:slug/players/:userId).
// Same fields the draft pool carries, resolved for a single user.
export interface PlayerProfile {
  user: MinimalUser;
  rsn: string | null; // their signup RSN for this bingo; null when they never signed up
  accountType: AccountType | null;
  womStats: WomPlayerStats | null;
  caCurrent: CombatAchievementStats | null;
  caPeak: CombatAchievementStats | null;
  profile: TectonicProfile | null;
  answers: SignupAnswer[] | null; // null unless the viewer is a mod or team lead
  tectonicUnavailable: boolean;
  // Matched by RSN against every stored past WOM competition (issue #128),
  // newest first. Best-effort: only covers competitions where one of this
  // user's signup RSNs (any bingo, past or present) appears in the roster.
  pastBingoStats: PastBingoParticipation[];
}

export interface DraftTeam extends Team {
  captainRsn: string; // captains aren't in `picks` (assigned pre-draft, not drafted) — this is the only source for their RSN
  coCaptain: { userId: string; rsn: string } | null; // duo mode: joined with the captain, also not in `picks`
}

// What a single pick drafts: one player, or a duo pair that stays together.
export interface DraftUnit {
  pairingId: string | null;
  entries: DraftPoolEntry[];
  cut: boolean; // cut from the draft as things stand (see CutMode): never drafted
}

// What every team drafts under the bingo's CutMode: the same number of pairs and of singles each.
export interface DraftShares {
  pairs: number;
  singles: number;
}

// GET /mod/draft/cuts: who is cut as things stand, for the confirmation before the draft stage.
export interface DraftCutPreview {
  cutMode: CutMode;
  teamCount: number;
  // Null with no cuts ("none") or fewer than two teams.
  shares: DraftShares | null;
  // Newest first; a pair is one entry with both names.
  cut: { names: string[]; pair: boolean }[];
}

// A team's private scouting note on a signup. Shared by captain and
// co-captain, never shown to other teams.
export interface PickRating {
  stars: number; // 0-MAX_RATING_STARS; 0 means note-only
  note: string;
}
export const MAX_RATING_STARS = 3;

export interface DraftState {
  teams: DraftTeam[]; // sorted by draftOrder once pick order is set
  picks: DraftPick[]; // a pair shares one pickNumber across two rows
  pool: DraftUnit[];
  draftStarted: boolean;
  orderReady: boolean; // ≥2 teams with a dense draftOrder 1..N
  // ISO timestamp until which picks are blocked after a shuffle. Null if unlocked.
  orderLockedUntil: string | null;
  // takes: what the team on the clock may still draft; a team that has its share of pairs (or singles) can't take
  // another. Both true with no cuts.
  currentPick: { pickNumber: number; round: number; teamId: string; takes: { pairs: boolean; singles: boolean } } | null;
  // What every team drafts; null with no cuts or fewer than two teams.
  shares: DraftShares | null;
  // Signups cut from the draft, once signups have closed. They are not in `pool`.
  cutCount: number;
  ratings: Record<string, PickRating>; // by signupId; empty unless the viewer leads a team
  tectonicUnavailable: boolean; // the clan API lookup failed, so every tectonicProfile is null
}

// ---------------------------------------------------------------------------
// Stats & timeline
// ---------------------------------------------------------------------------

export interface PointsOverTimePoint {
  at: string;
  teamId: string;
  source: "node" | "adjustment";
  label: string;
  delta: number;
  cumulativePoints: number;
}

export type TimelineEventType = "points_earned" | "line_completed" | "point_adjustment" | "first_completion" | "stage_changed";

export interface TimelineEvent {
  at: string;
  type: TimelineEventType;
  teamId: string | null;
  /** What happened, without the team or the points: "ZULRAH — Page 1", "Row 2 line bonus", a mod's reason. */
  what: string;
  /** Points it moved; null for first completions and stage changes. */
  points: number | null;
}

export interface ContributionClaim {
  submissionId: string;
  label: string;
  /** How much of it counted: a SUM's last claim only counts for what was still needed. */
  quantity: number;
}

// One award a player has a Points share of (CONTEXT.md).
export interface ContributionAward {
  nodeId: string;
  kind: "task" | "tile" | "line";
  label: string;
  awardPoints: number;
  points: number;
  fraction: number;
  claims: ContributionClaim[];
  /** Line bonuses: the tiles of the line this player had a share of. */
  viaTiles?: string[];
}

export interface ContributionCount {
  userId: string;
  user: MinimalUser;
  teamId: string;
  approvedSubmissions: number;
  /** Unrounded; shown to two decimal places. */
  pointsShare: number;
  awards: ContributionAward[];
}

export interface TileHeatmapCell {
  tileId: string;
  teamId: string;
  completedTasks: number;
  totalTasks: number;
}

export interface StatsResponse {
  pointsOverTime: PointsOverTimePoint[];
  timeline: TimelineEvent[];
  contributions: ContributionCount[];
  heatmap: TileHeatmapCell[];
}

// ---------------------------------------------------------------------------
// OSRS Wiki item search, matching server/src/services/osrsWikiService.ts
// ---------------------------------------------------------------------------

export interface OsrsItemSearchResult {
  name: string;
  iconUrl: string;
  wikiUrl: string;
}

// ---------------------------------------------------------------------------
// WebSocket envelope, matching server/src/ws.ts
// ---------------------------------------------------------------------------

export type BroadcastEvent =
  | { type: "submission_created"; bingoId: string; payload: { teamId: string } }
  | { type: "submission_reviewed"; bingoId: string; payload: { teamId: string; nodeIds: string[] } }
  | { type: "stage_changed"; bingoId: string; payload: { stage: Stage } }
  | { type: "draft_started"; bingoId: string; payload: Record<string, never> }
  | { type: "draft_order_shuffled"; bingoId: string; payload: { lockedUntil: string; order: { teamId: string; draftOrder: number }[] } }
  | { type: "draft_order_set"; bingoId: string; payload: { order: { teamId: string; draftOrder: number }[] } }
  | { type: "draft_pick"; bingoId: string; payload: { pickNumber: number; teamId: string; userIds: string[] } }
  // An admin took back the latest pick; its players are back in the pool.
  | { type: "draft_pick_undone"; bingoId: string; payload: { pickNumber: number; teamId: string; userIds: string[] } }
  // A team lead starred/noted a signup. Other leads of the same team refetch
  // draft state; the rating itself stays behind GET /draft's auth.
  | { type: "draft_rating_changed"; bingoId: string; payload: { teamId: string } }
  // Someone on a team raised or lowered a hand for a tile; teammates refetch
  // progress so the board shows who's on what.
  | { type: "tile_interest_changed"; bingoId: string; payload: { teamId: string } }
  | { type: "team_updated"; bingoId: string; payload: { teamId: string } }
  // A duo pairing request was created, answered, cancelled, or dissolved, or a
  // signup changed. Clients refetch their own signup/pairing state and the mod
  // roster. statsRefreshing is a boolean flag only (no CA values) — the
  // unauthenticated socket may carry IDs, not snapshots.
  // statsFailed: with statsRefreshing false, whether that stats lookup failed (the roster's refresh button shows a tick or a cross).
  | { type: "signup_changed"; bingoId: string; payload: { signupId?: string; userId?: string; statsRefreshing?: boolean; statsFailed?: boolean } }
  // Any successful admin mutation (settings, board, lines, questions, teams,
  // mods). Coarse on purpose: clients refetch the bingo shell + board.
  | { type: "bingo_changed"; bingoId: string; payload: Record<string, never> }
  // A new audit_log row was appended. Ids/visibility only, per the
  // unauthenticated-broadcast rule below — clients invalidate their audit
  // log / team activity queries and refetch under their own auth.
  | { type: "audit_appended"; bingoId: string; payload: { teamId: string | null; visibility: AuditVisibility } }
  // A bug report was filed or its status changed. Site-wide, not bingo-scoped
  // — id only, per the unauthenticated-broadcast rule above. Clients refetch
  // the admin list and their own reports under their own auth.
  | { type: "bug_report_changed"; payload: { id: string } };

export * from "./audit.ts";
export * from "./auditCondense.ts";
export * from "./bingoExport.ts";
export * from "./exclusivity.ts";
export * from "./names.ts";
export * from "./signupAnswers.ts";
export * from "./testData.ts";
export * from "./timezone.ts";
