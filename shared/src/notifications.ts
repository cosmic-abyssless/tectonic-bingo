// Notifications (CONTEXT.md "Notification", "Inbox", "Catch-up"; docs/adr/0003-discord-dms-not-web-push.md). The one
// catalogue of kinds the server's dispatcher, the settings page and the test data generator all read: adding a kind is
// one entry here plus its mapping in the server's notificationDispatch.ts.

/**
 * A user's one Notification setting. Each step includes the ones before it: `app` is the Inbox and toasts, `browser`
 * adds a browser notification while the site is open but not in view, `discord` adds a Discord DM when it isn't open.
 */
export const NOTIFICATION_LEVELS = ["off", "app", "browser", "discord"] as const;
export type NotificationLevel = (typeof NOTIFICATION_LEVELS)[number];

export const NOTIFICATION_LEVEL_LABELS: Record<NotificationLevel, string> = {
  off: "Off",
  app: "In the app",
  browser: "+ Browser",
  discord: "+ Discord",
};

export function levelAtLeast(level: NotificationLevel, step: NotificationLevel): boolean {
  return NOTIFICATION_LEVELS.indexOf(level) >= NOTIFICATION_LEVELS.indexOf(step);
}

/** Who a group of kinds is for. A user sees a group's rows only when they hold that role in some Bingo (site-wide: everyone). */
export type NotificationGroup = "player" | "captain" | "moderator" | "admin" | "site";

export const NOTIFICATION_GROUP_LABELS: Record<NotificationGroup, string> = {
  player: "As a Player",
  captain: "As a Captain",
  moderator: "As a Moderator",
  admin: "As an Admin or Staff",
  site: "Site-wide",
};

export const NOTIFICATION_KINDS = [
  "drop_rejected",
  "team_drop_approved",
  "team_tile_completed",
  "team_part_completed",
  "proof_needed",
  "pairing_request",
  "drafted",
  "bingo_stage",
  "superlative_reminder",
  "on_the_clock",
  "draft_starting",
  "submissions_waiting",
  "queue_waiting_long",
  "new_signups",
  "went_live_by_itself",
  "cut_warning",
  "bug_report_filed",
  "buyin_marked",
  "bingo_open",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** What a folded Discord DM is built from: each Notification's own data, in the order they happened. */
export interface NotificationData {
  /** Who it's about or who did it ("Lynx Titan"), when a fold names them. */
  name?: string;
  /** Points it was worth, when a fold adds them up. */
  points?: number;
  /** When the oldest thing it counts started waiting (ISO), for "oldest 12 min". */
  since?: string;
  /** What a pending DM checks is still true before it's sent: a Pairing request's pairing id, On the clock's "teamId:pickNumber". */
  ref?: string;
}

export interface NotificationKindDef {
  group: NotificationGroup;
  /** ⭐ in the catalogue: on for a user who hasn't said otherwise. */
  defaultOn: boolean;
  /** The settings page's row. */
  label: string;
  /** What the row says it's about, under the label. */
  description: string;
  /**
   * One Discord DM for a burst of this kind (CONTEXT.md "Folding"), from two or more Notifications' data, oldest first.
   * Kinds without one are never folded: each is its own DM.
   */
  fold?(entries: NotificationData[], bingoName: string | null): string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Lynx Titan", "Lynx Titan and Zezima", "Lynx Titan and 2 others". */
export function namesSummary(names: string[]): string {
  const distinct = [...new Set(names.filter(Boolean))];
  if (distinct.length === 0) return "Your Team";
  if (distinct.length === 1) return distinct[0]!;
  if (distinct.length === 2) return `${distinct[0]} and ${distinct[1]}`;
  return `${distinct[0]} and ${distinct.length - 1} others`;
}

/** "12 min", "3 h": how long ago, for a queue's oldest Submission. */
export function waitedFor(sinceIso: string | undefined, now: Date): string {
  if (!sinceIso) return "";
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(sinceIso).getTime()) / 60_000));
  return minutes < 90 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}

const inBingo = (bingoName: string | null) => (bingoName ? ` in ${bingoName}` : "");

export const NOTIFICATION_CATALOGUE: Record<NotificationKind, NotificationKindDef> = {
  drop_rejected: { group: "player", defaultOn: true, label: "Your drop rejected", description: "With the reviewer's note." },
  team_drop_approved: {
    group: "player",
    defaultOn: false,
    label: "Team drop approved",
    description: "Any approved drop of your Team, yours included.",
    fold: (entries, bingoName) => {
      const points = entries.reduce((sum, e) => sum + (e.points ?? 0), 0);
      return `${namesSummary(entries.map((e) => e.name ?? ""))}: ${plural(entries.length, "drop")} approved${points ? ` (+${points})` : ""}${inBingo(bingoName)}`;
    },
  },
  team_tile_completed: {
    group: "player",
    defaultOn: true,
    label: "Team completed a Tile",
    description: "And any Line it closed.",
    fold: (entries, bingoName) => `Your Team completed ${plural(entries.length, "Tile")}${inBingo(bingoName)}: ${entries.map((e) => e.name).filter(Boolean).join(", ")}`,
  },
  team_part_completed: {
    group: "player",
    defaultOn: false,
    label: "Team completed a Part",
    description: "Each Part of a Tile your Team finishes.",
    fold: (entries, bingoName) => `Your Team completed ${plural(entries.length, "Part")}${inBingo(bingoName)}`,
  },
  proof_needed: { group: "player", defaultOn: true, label: "Proof screenshot needed", description: "A drop of yours was flagged for a missing Proof screenshot." },
  pairing_request: { group: "player", defaultOn: true, label: "Pairing request", description: "Someone asked to be your Duo, or answered yours." },
  drafted: { group: "player", defaultOn: true, label: "You were drafted", description: "Which Team picked you." },
  bingo_stage: { group: "player", defaultOn: true, label: "Bingo went Live / Finished", description: "When a Bingo you play starts and ends." },
  superlative_reminder: { group: "player", defaultOn: false, label: "Superlative voting reminder", description: "Once, a day before an announced end date, if you haven't voted." },
  on_the_clock: { group: "captain", defaultOn: true, label: "On the clock", description: "Your Team is picking in the Draft." },
  draft_starting: { group: "captain", defaultOn: true, label: "Draft starting", description: "The Draft has started." },
  submissions_waiting: {
    group: "moderator",
    defaultOn: true,
    label: "Submissions waiting",
    description: "A new Submission to review.",
    fold: (entries, bingoName) => `${plural(entries.length, "Submission")} waiting${inBingo(bingoName)}${entries[0]?.since ? `, oldest ${waitedFor(entries[0].since, new Date())}` : ""}`,
  },
  queue_waiting_long: { group: "moderator", defaultOn: false, label: "Queue waiting long", description: "The oldest pending Submission has waited past your threshold." },
  new_signups: {
    group: "moderator",
    defaultOn: false,
    label: "New signups",
    description: "Someone signed up.",
    fold: (entries, bingoName) => `${plural(entries.length, "new signup")}${inBingo(bingoName)}: ${namesSummary(entries.map((e) => e.name ?? ""))}`,
  },
  went_live_by_itself: { group: "admin", defaultOn: true, label: "Bingo went Live by itself", description: "It reached its start date." },
  cut_warning: { group: "admin", defaultOn: false, label: "Cut warning", description: "Signups closed with an Unavoidable cut." },
  bug_report_filed: { group: "admin", defaultOn: false, label: "Bug report filed", description: "Site admins only." },
  buyin_marked: { group: "admin", defaultOn: false, label: "Buy-in marked", description: "By someone else (Staff)." },
  bingo_open: { group: "site", defaultOn: false, label: "New Bingo open for signups", description: "A Bingo opened its signups." },
};

/** Whether `kind` is on for a user with these overrides (only what differs from the defaults is stored). */
export function isKindOn(kind: NotificationKind, overrides: Partial<Record<NotificationKind, boolean>>): boolean {
  return overrides[kind] ?? NOTIFICATION_CATALOGUE[kind].defaultOn;
}

/** Whether a kind that's on also goes to Discord at + Discord: yes unless the user kept it off. */
export function isDiscordKindOn(kind: NotificationKind, overrides: Partial<Record<NotificationKind, boolean>>): boolean {
  return overrides[kind] ?? true;
}

export function isNotificationKind(value: unknown): value is NotificationKind {
  return typeof value === "string" && (NOTIFICATION_KINDS as readonly string[]).includes(value);
}

/** Queue waiting long: past how many minutes the oldest pending Submission counts as waiting long. */
export const QUEUE_THRESHOLDS = [30, 60, 120] as const;
export type QueueThreshold = (typeof QUEUE_THRESHOLDS)[number];
export const DEFAULT_QUEUE_THRESHOLD: QueueThreshold = 60;

/** The one-time inline offers to turn Notifications on. At most one per user per Bingo. */
export const NOTIFICATION_OFFERS = ["first_submission", "mod_panel", "draft_room"] as const;
export type NotificationOffer = (typeof NOTIFICATION_OFFERS)[number];

/** Discord DM folding windows (Site admin settings), in minutes. A kind not listed is sent at once. */
export type FoldingWindows = Partial<Record<NotificationKind, number>>;
export const DEFAULT_FOLDING_WINDOWS: FoldingWindows = { team_drop_approved: 15, submissions_waiting: 10, new_signups: 60 };

/** The viewer's settings (GET/PUT /api/me/notifications/settings). */
export interface NotificationSettings {
  level: NotificationLevel;
  /** Only the kinds that differ from their default. */
  kinds: Partial<Record<NotificationKind, boolean>>;
  /** At + Discord, the kinds kept off Discord (false); every other kind that's on is DMed too. */
  discordKinds: Partial<Record<NotificationKind, boolean>>;
  queueThresholdMinutes: QueueThreshold;
  catchUpEnabled: boolean;
}

export interface NotificationSettingsResponse {
  settings: NotificationSettings;
  /** The groups whose kinds this user sees: those of roles they hold in some Bingo, plus site-wide. */
  groups: NotificationGroup[];
  /** Whether the + Discord step can be chosen (the bot's token is set, or a dev server's fake DM sink). */
  discordAvailable: boolean;
  /** Set when a DM failed because Discord won't let the bot reach them (error 50007): when it was. */
  discordUnreachableSince: string | null;
}

export interface NotificationEntry {
  id: string;
  bingoId: string | null;
  kind: NotificationKind;
  title: string;
  body: string | null;
  /** A path in the app, e.g. "/b/summer-2026/mod?tab=submissions". */
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationInboxResponse {
  notifications: NotificationEntry[];
  unread: number;
}

/**
 * What the server sends one user's sockets when their Notifications change: ids only (each tab fetches the Inbox under
 * its own auth). `deliver`: how this socket should show the new ones, per the delivery chain (CONTEXT.md "Notification"):
 * a toast (it's visible), a browser notification (no tab is visible and this browser allowed them), or nothing (the
 * Inbox only: it was read, or another socket shows it).
 */
export type NotificationSocketMessage = { type: "notifications"; ids: string[]; deliver: "toast" | "browser" | "none" };

/** A Bingo's Catch-up (CONTEXT.md), for one viewer, since they last had it open. */
export interface CatchUpLine {
  text: string;
  /** A path in the app. */
  link: string | null;
}

export interface CatchUpSection {
  key: "needs_you" | "your_drops" | "your_team" | "bingo";
  title: string;
  lines: CatchUpLine[];
}

export interface CatchUpResponse {
  /** Off: no card. */
  enabled: boolean;
  /** The window: from when they last had it open (ISO). Null when there's no card to show. */
  since: string | null;
  /** The collapsed one-line summary ("+120 points, 2 Tiles, your Vorkath drop was approved"). */
  summary: string | null;
  sections: CatchUpSection[];
}

/** Every Discord DM a dev server would have sent (its fake sink), newest first. */
export interface DevDmSinkEntry {
  id: string;
  userId: string;
  userName: string;
  kind: NotificationKind;
  bingoId: string | null;
  text: string;
  count: number;
  sentAt: string;
}
