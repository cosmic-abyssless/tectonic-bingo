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

export type Stage = "planning" | "signup" | "captains" | "draft" | "reveal" | "live" | "complete";
export const STAGE_ORDER: Stage[] = ["planning", "signup", "captains", "draft", "reveal", "live", "complete"];

// Players can see the board from `reveal` onward; structural board edits are
// locked from the same point (mirrors server bingoService.isBoardRevealed).
export function isBoardRevealed(stage: Stage): boolean {
  return stage === "reveal" || stage === "live" || stage === "complete";
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
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Bingo {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  theme: string;
  stage: Stage;
  boardRows: number;
  boardCols: number;
  buyinAmount: number | null;
  bonusPotAmount: number;
  rulesMarkdown: string | null;
  signupOpensAt: string | null;
  draftScheduledAt: string | null;
  revealScheduledAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
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
  submittedByUserId: string;
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

export type MinimalUser = Pick<User, "id" | "discordUsername" | "discordGlobalName" | "discordGuildNick">;

export interface SubmissionDetails {
  submission: Submission;
  screenshots: SubmissionScreenshot[];
  claims: Claim[];
  submittedByUser: MinimalUser | null;
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
  bingo: Bingo;
  categories: TileCategory[];
  teams: Team[];
  isMod: boolean;
  myTeam: Team | null;
  paidSignupCount: number;
  potTotal: number;
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
  /** Sum of points newly awarded by this approval. */
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
  ehb: number;
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
}

export interface DraftTeam extends Team {
  captainRsn: string; // captains aren't in `picks` (assigned pre-draft, not drafted) — this is the only source for their RSN
}

export interface DraftState {
  teams: DraftTeam[]; // sorted by draftOrder once the draft has started
  picks: DraftPick[];
  pool: DraftPoolEntry[];
  draftStarted: boolean;
  currentPick: { pickNumber: number; round: number; teamId: string } | null;
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

export type TimelineEventType = "stage_changed" | "draft_pick" | "line_completed" | "first_completion";

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
  | { type: "draft_pick"; bingoId: string; payload: { pickNumber: number; teamId: string; userId: string } }
  | { type: "team_updated"; bingoId: string; payload: { teamId: string } };
