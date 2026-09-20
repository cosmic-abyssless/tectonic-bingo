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

// What happens to signups that don't fill a full draft round (teams stay
// equal-sized): dropped from the draft, or drafted in a final singles round.
export const LEFTOVER_MODES = ["cut", "singles"] as const;
export type LeftoverMode = (typeof LEFTOVER_MODES)[number];

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
  leftoverMode: LeftoverMode;
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

export type BugReportStatus = "open" | "resolved";

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
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface BugReportWithReporter extends BugReport {
  reporter: MinimalUser | null;
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

export type SignupQuestionType = "text" | "textarea" | "select" | "boolean";

export interface SignupQuestion {
  id: string;
  bingoId: string;
  prompt: string;
  type: SignupQuestionType;
  optionsJson: string | null;
  required: boolean;
  sortOrder: number;
}

export type SignupStatus = "active" | "withdrawn";

export interface Signup {
  id: string;
  bingoId: string;
  userId: string;
  rsn: string;
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
  // Mod roster only: undrafted and not fitting a full draft round (see LeftoverMode).
  leftover?: boolean;
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

export type PairingStatus = "pending" | "accepted" | "declined" | "cancelled" | "dissolved";

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

// One side of a pairing as the other side should see them. `user` is null
// until they've logged in (the client then falls back to the clan roster);
// `rsn` is set once they've signed up for this bingo.
export interface PairingParty {
  user: MinimalUser | null;
  rsn: string | null;
}

export interface MyPairingResponse {
  // Accepted pair, if any.
  partner: ({ pairing: SignupPairing } & PairingParty) | null;
  // The single pending request the player has made.
  outgoing: { pairing: SignupPairing; target: PairingParty } | null;
  // Pending requests made to the player.
  incoming: { pairing: SignupPairing; requester: PairingParty }[];
  // Why the player is currently unpaired, when their last pairing ended
  // without them choosing to: a partner declined, or a partner withdrew.
  lastOutcome: { status: "declined" | "dissolved"; other: PairingParty } | null;
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
}

export interface DraftTeam extends Team {
  captainRsn: string; // captains aren't in `picks` (assigned pre-draft, not drafted) — this is the only source for their RSN
  coCaptain: { userId: string; rsn: string } | null; // duo mode: joined with the captain, also not in `picks`
}

// What a single pick drafts: one player, or a duo pair that stays together.
export interface DraftUnit {
  pairingId: string | null;
  entries: DraftPoolEntry[];
  leftover: boolean; // doesn't fit a full round: cut, or drafted in the singles round
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
  // singlesRound: the main pool is empty and leftovers are being drafted.
  currentPick: { pickNumber: number; round: number; teamId: string; singlesRound: boolean } | null;
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
  label: string;
  teamId: string | null;
}

export interface ContributionCount {
  userId: string;
  user: MinimalUser;
  teamId: string;
  approvedSubmissions: number;
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
  | { type: "signup_changed"; bingoId: string; payload: { signupId?: string; userId?: string; statsRefreshing?: boolean } }
  // Any successful admin mutation (settings, board, lines, questions, teams,
  // mods). Coarse on purpose: clients refetch the bingo shell + board.
  | { type: "bingo_changed"; bingoId: string; payload: Record<string, never> }
  // A new audit_log row was appended. Ids/visibility only, per the
  // unauthenticated-broadcast rule below — clients invalidate their audit
  // log / team activity queries and refetch under their own auth.
  | { type: "audit_appended"; bingoId: string; payload: { teamId: string | null; visibility: AuditVisibility } };

export * from "./audit.ts";
export * from "./auditCondense.ts";
export * from "./bingoExport.ts";
export * from "./exclusivity.ts";
export * from "./names.ts";
