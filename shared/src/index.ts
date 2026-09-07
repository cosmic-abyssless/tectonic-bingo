// Types shared between client and server, matching the API's actual JSON
// shapes (dates arrive as ISO strings, not Date objects). Domain rows mirror
// server/src/db/schema.ts field-for-field; nest/derived shapes match what
// each route actually returns.

export type Stage = "planning" | "signup" | "captains" | "draft" | "reveal" | "live" | "complete";
export const STAGE_ORDER: Stage[] = ["planning", "signup", "captains", "draft", "reveal", "live", "complete"];

export type TaskStatus = "not_started" | "in_progress" | "pending_approval" | "completed";
export type SubmissionStatus = "pending" | "approved" | "rejected";
export type ScoringMode = "automatic" | "manual";

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

export type RequirementKind = "ALL" | "ANY" | "COUNT" | "ITEM" | "MANUAL";

// A task's requirement tree. Composite nodes (ALL/ANY/COUNT) have children;
// ITEM leaves accept claims for their group's items plus inline itemNames.
export interface RequirementNode {
  id: string;
  taskId: string;
  parentId: string | null;
  sortOrder: number;
  kind: RequirementKind;
  minCount: number | null;
  quantity: number | null;
  distinctItems: boolean;
  itemGroupId: string | null;
  itemGroupName: string | null;
  /** Inline item names only (what the admin typed on this leaf). */
  itemNames: string[];
  /** Inline names plus the referenced group's items — what a claim may name. */
  acceptedItemNames: string[];
  children: RequirementNode[];
}

// Admin input shape for creating/replacing a task's requirement tree.
export interface RequirementNodeInput {
  kind: RequirementKind;
  minCount?: number;
  quantity?: number;
  distinctItems?: boolean;
  itemGroupId?: string;
  itemNames?: string[];
  children?: RequirementNodeInput[];
}

// The raw tile_tasks row, as returned unnested (e.g. in mod submission rows).
export interface TileTaskBase {
  id: string;
  tileId: string;
  label: string;
  sortOrder: number;
  points: number;
  description: string;
  scoringMode: ScoringMode;
  submitRequiresPrevious: boolean;
  pointsRequirePrevious: boolean;
  allowsPreLoad: boolean;
  notes: string | null;
}

export interface TileTask extends TileTaskBase {
  requirement: RequirementNode;
}

export interface TileWildcard {
  id: string;
  tileId: string;
  itemName: string;
  maxRedemptionsPerTeam: number;
  description: string | null;
  applicableNodeId: string | null;
}

// The raw tiles row, as returned unnested (e.g. in mod submission rows).
export interface TileBase {
  id: string;
  bingoId: string;
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
  tasks: TileTask[];
  wildcards: TileWildcard[];
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
  pointsAwarded: number | null;
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

// One drop allocated to a requirement leaf. taskId is denormalised from the
// leaf for convenience. itemName is null for MANUAL leaves.
export interface Claim {
  id: string;
  submissionId: string;
  nodeId: string;
  taskId: string;
  itemName: string | null;
  quantity: number;
  wildcardId: string | null;
}

export type MinimalUser = Pick<User, "id" | "discordUsername" | "discordGlobalName" | "discordGuildNick">;

export interface SubmissionDetails {
  submission: Submission;
  screenshots: SubmissionScreenshot[];
  claims: Claim[];
  submittedByUser: MinimalUser | null;
}

export interface ModSubmissionRow extends SubmissionDetails {
  tasks: TileTaskBase[];
  tile: TileBase;
  team: Pick<Team, "id" | "name" | "color">;
}

export interface TeamTaskProgress {
  id: string;
  teamId: string;
  taskId: string;
  status: TaskStatus;
  pointsAwarded: number;
  completedAt: string | null;
}

export interface CompletedLine {
  bingoLineId: string;
  points: number;
  completedAt: string;
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
  tasks: TeamTaskProgress[];
  completedLines: CompletedLine[];
  adjustments: PointAdjustment[];
  totalPoints: number;
}

export interface ScreenshotAnalysis {
  codewordFound: boolean;
  codeword: string;
  extractedText: string[];
  detectedMatch: { tileId: string; tileName: string; taskId: string; nodeId: string; itemName: string } | null;
  detectedWildcard: { tileId: string; tileName: string; wildcardId: string; itemName: string; applicableNodeId: string | null } | null;
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

export interface BoardResponse {
  tiles: Tile[];
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

export interface ClaimInput {
  nodeId: string;
  itemName?: string;
  quantity?: number;
  wildcardId?: string;
}

export interface CreateSubmissionPayload {
  claims: ClaimInput[];
  screenshotUrl: string;
}

export interface ReviewSubmissionResponse {
  submission: Submission;
  // Every task the submission's claims touched.
  taskIds: string[];
  // Tasks completed by this approval (empty when none completed or on reject).
  completedTaskIds?: string[];
  pointsAwarded?: number;
  completedLineIds?: string[];
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

export interface BingoLine {
  id: string;
  bingoId: string;
  lineType: "row" | "column" | "diagonal" | "custom";
  lineIndex: number;
  points: number;
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
  source: "task" | "line" | "adjustment";
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
// WebSocket envelope, matching server/src/ws.ts
// ---------------------------------------------------------------------------

export type BroadcastEvent =
  | { type: "submission_created"; bingoId: string; payload: { teamId: string } }
  | { type: "submission_reviewed"; bingoId: string; payload: { teamId: string; taskIds: string[] } }
  | { type: "stage_changed"; bingoId: string; payload: { stage: Stage } }
  | { type: "draft_started"; bingoId: string; payload: Record<string, never> }
  | { type: "draft_pick"; bingoId: string; payload: { pickNumber: number; teamId: string; userId: string } }
  | { type: "team_updated"; bingoId: string; payload: { teamId: string } };
