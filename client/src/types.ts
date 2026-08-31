export type BadgeCategory = 'demonic' | 'draconic' | 'spectral' | 'animalistic' | 'god_wars' | 'vampyric' | 'desert';

export type SideStatus = 'not_started' | 'in_progress' | 'pending_approval' | 'completed';

export interface TileProgress {
  tileId: string;
  sideAStatus: SideStatus;
  sideAPointsAwarded: number;
  sideBStatus: SideStatus;
  sideBPointsAwarded: number;
}

export interface TeamProgressResponse {
  team: { id: string; name: string; color: string | null };
  totalPoints: number;
  tilePoints: number;
  lineBonus: number;
  adjustments: number;
  tileProgress: TileProgress[];
}

export interface TileSideItem {
  id: string;
  itemName: string;
  quantity: number;
  optionsGroup: string | null;
  sortOrder: number;
}

export interface TileWildcard {
  id: string;
  itemName: string;
  description: string | null;
  maxRedemptionsPerTeam: number;
  applicableToSide: 'A' | 'B' | null;
}

export interface TileSide {
  id: string;
  side: 'A' | 'B';
  points: number;
  description: string;
  requiresNoDuplicates: boolean;
  allowsPreviouslyAcquired: boolean;
  allowsPreLoad: boolean;
  requiresPartA: boolean;
  minSubmissions: number;
  requiresCompleteSet: boolean;
  notes: string | null;
  items: TileSideItem[];
}

export interface BoardTile {
  id: string;
  name: string;
  badgeCategory: BadgeCategory;
  boardRow: number;
  boardCol: number;
  totalPoints: number;
  hasFreezePeriod: boolean;
  freezeDurationMinutes: number;
  sides: { A?: TileSide; B?: TileSide };
  wildcards: TileWildcard[];
}

export interface TeamInfo {
  id: string;
  name: string;
  color: string | null;
}

export interface BingoEvent {
  id: string;
  name: string;
  startsAt: string; // ISO 8601 from JSON.stringify(Date)
  endsAt: string;
  potAmount: number | null;
}

export interface BoardResponse {
  event: BingoEvent;
  tiles: BoardTile[];
}

export interface SubmissionScreenshot {
  url: string;
  type: "main" | "pre_screenshot" | "bank" | "collection_log" | "other";
}

export interface SubmissionSummary {
  id: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string; // ISO timestamp
  reviewerNotes: string | null;
  tileId: string;
  tileName: string;
  badgeCategory: BadgeCategory;
  side: "A" | "B";
  submittedBy: string;
  isWildcardRedemption: boolean;
  wildcardItemName: string | null;
  items: { itemName: string; quantity: number; targetQuantity: number }[];
  screenshots: SubmissionScreenshot[];
}

export interface ModSubmission {
  id: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  reviewerNotes: string | null;
  pointsAwarded: number | null;
  teamId: string;
  teamName: string;
  tileId: string;
  tileName: string;
  badgeCategory: BadgeCategory;
  side: "A" | "B";
  sidePoints: number;
  submittedBy: string;
  codewordVerified: boolean | null;
  isWildcardRedemption: boolean;
  wildcardItemName: string | null;
  items: { itemName: string; quantity: number; targetQuantity: number }[];
  screenshots: SubmissionScreenshot[];
}

export interface ScreenshotAnalysis {
  codewordFound: boolean;
  codeword: string;
  detectedMatch: {
    tileId: string;
    tileName: string;
    tileSideItemId: string;
    side: "A" | "B";
    itemName: string;
  } | null;
  detectedWildcard: {
    tileId: string;
    tileName: string;
    wildcardId: string;
    itemName: string;
    applicableToSide: "A" | "B" | null;
  } | null;
  warnings: string[];
}

export interface TeamSubmissionsResponse {
  submissions: SubmissionSummary[];
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
  verified?: boolean;
  global_name?: string | null;
  guild_nick: string | null;
  team: string | null;
  isModerator: boolean;
}

/** guild nick → global display name → username */
export function displayName(user: DiscordUser): string {
  return user.guild_nick ?? user.global_name ?? user.username;
}

export function avatarUrl(user: DiscordUser): string {
  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
  }
  // Default Discord avatar based on discriminator or ID
  const index =
    user.discriminator === "0"
      ? Number(BigInt(user.id) >> 22n) % 6
      : parseInt(user.discriminator) % 5;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}
