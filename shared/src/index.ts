// Types shared between client and server, matching the API's actual JSON
// shapes (dates arrive as ISO strings, not Date objects). Domain rows mirror
// server/src/db/schema.ts field-for-field; nest/derived shapes match what
// each route actually returns.

export type Stage = "planning" | "signup" | "draft" | "reveal" | "live" | "complete";
export const STAGE_ORDER: Stage[] = ["planning", "signup", "draft", "reveal", "live", "complete"];

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

export interface TileTaskItem {
  id: string;
  taskId: string;
  itemName: string;
  quantity: number;
  optionsGroup: string | null;
  sortOrder: number;
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
  requiresNoDuplicates: boolean;
  allowsPreviouslyAcquired: boolean;
  allowsPreLoad: boolean;
  minSubmissions: number;
  requiresCompleteSet: boolean;
  notes: string | null;
}

export interface TileTask extends TileTaskBase {
  items: TileTaskItem[];
}

export interface TileWildcard {
  id: string;
  tileId: string;
  itemName: string;
  maxRedemptionsPerTeam: number;
  description: string | null;
  applicableTaskId: string | null;
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
  taskId: string;
  submittedByUserId: string;
  status: SubmissionStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewerNotes: string | null;
  pointsAwarded: number | null;
  isWildcardRedemption: boolean;
  wildcardId: string | null;
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

export interface SubmissionItemClaim {
  id: string;
  submissionId: string;
  itemName: string;
  quantity: number;
  taskItemId: string | null;
}

export type MinimalUser = Pick<User, "id" | "discordUsername" | "discordGlobalName" | "discordGuildNick">;

export interface SubmissionDetails {
  submission: Submission;
  screenshots: SubmissionScreenshot[];
  claims: SubmissionItemClaim[];
  submittedByUser: MinimalUser | null;
}

export interface ModSubmissionRow extends SubmissionDetails {
  task: TileTaskBase;
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
  detectedMatch: { tileId: string; tileName: string; taskId: string; taskItemId: string; itemName: string } | null;
  detectedWildcard: { tileId: string; tileName: string; wildcardId: string; itemName: string; applicableTaskId: string | null } | null;
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
}

export interface CreateSubmissionResponse {
  submission: Submission;
}

export interface ReviewSubmissionResponse {
  submission: Submission;
  taskCompleted: boolean;
  pointsAwarded: number;
  completedLineIds: string[];
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

export interface RosterEntry {
  signup: Signup;
  user: User;
  answers: SignupAnswer[];
}

export interface RosterResponse {
  signups: RosterEntry[];
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
}

export interface DraftPoolEntry {
  signup: Signup;
  user: MinimalUser;
  answers: SignupAnswer[] | null; // null unless the requester is a mod or captain
}

export interface DraftState {
  teams: Team[]; // sorted by draftOrder once the draft has started
  picks: DraftPick[];
  pool: DraftPoolEntry[];
  draftStarted: boolean;
  currentPick: { pickNumber: number; round: number; teamId: string } | null;
}

// ---------------------------------------------------------------------------
// WebSocket envelope, matching server/src/ws.ts
// ---------------------------------------------------------------------------

export type BroadcastEvent =
  | { type: "submission_created"; bingoId: string; payload: { teamId: string } }
  | { type: "submission_reviewed"; bingoId: string; payload: { teamId: string; taskId: string } }
  | { type: "stage_changed"; bingoId: string; payload: { stage: Stage } }
  | { type: "draft_started"; bingoId: string; payload: Record<string, never> }
  | { type: "draft_pick"; bingoId: string; payload: { pickNumber: number; teamId: string; userId: string } }
  | { type: "team_updated"; bingoId: string; payload: { teamId: string } };
