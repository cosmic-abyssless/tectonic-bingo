// The Achievement catalogue (CONTEXT.md "Achievement"): a just-for-fun layer on top of a Bingo, never touching
// points, scoring, the Board or review. One shared list, used by both server and client — order here is display
// order. Rules for how each one is earned live only on the server (server/src/services/achievementService.ts),
// keyed by `key`, so a Hidden Achievement's condition is never shipped to the client.
//
// Adding an Achievement later: add a catalogue entry here, and a rule in achievementService.ts. Nothing else.
export type AchievementKey =
  | "strong_start"
  | "drop_detective"
  | "hypeman"
  | "cheerleader"
  | "partner_slayer"
  | "big_spender"
  | "regular"
  | "globetrotter"
  | "eager_beaver"
  | "superfan"
  | "popular"
  | "leech"
  | "night_owl"
  | "early_bird"
  | "main_character"
  | "called_it"
  | "rules_lawyer"
  | "number_cruncher";

export interface AchievementDef {
  key: AchievementKey;
  name: string;
  /** Short, player-facing — no fine print ("during Live", "device time", "as first priced"). */
  description: string;
  /** A line of flavour, shown under the description in the unlock popup and, once earned, the Achievements list. */
  flavor: string;
  /** Shown as a "???" slot until earned; the server never reveals its name/description/icon before then. */
  hidden: boolean;
  /** An OSRS item name, rendered with the existing wiki icon helper. */
  itemName: string;
  /**
   * The denominator for a counted Achievement's progress ("4/10"), when it's fixed. Drop detective's target is the
   * Board's current Tile count instead, computed at read time — see achievementService.getMyAchievements.
   */
  progressTarget?: number;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { key: "strong_start", name: "Strong start", description: "Submit your first drop", flavor: "Spoooon!", hidden: false, itemName: "Bronze sword" },
  { key: "drop_detective", name: "Drop detective", description: "Open every tile on the board", flavor: "Very thorough of you!", hidden: true, itemName: "Deerstalker" },
  { key: "hypeman", name: "Hypeman", description: "React to a teammate's submission", flavor: "Let's gooooo", hidden: false, itemName: "Enchanted lyre" },
  { key: "cheerleader", name: "Cheerleader", description: "React to 10 different submissions", flavor: "Keeping the hype train going", hidden: true, itemName: "Red partyhat", progressTarget: 10 },
  { key: "partner_slayer", name: "Partner slayer", description: "Submit a drop on behalf of a teammate", flavor: "What a team player you are", hidden: false, itemName: "Slayer helmet" },
  { key: "big_spender", name: "Moneybags", description: "Submit a drop worth 25m or more", flavor: "Split, I TBed!", hidden: false, itemName: "Coins 10000" },
  { key: "regular", name: "Regular", description: "Submit drops on 5 different days", flavor: "Did you take PTO for this bingo?", hidden: false, itemName: "Giant stopwatch", progressTarget: 5 },
  { key: "globetrotter", name: "Globetrotter", description: "Submit drops on 5 different tiles", flavor: "Bro's content hopping", hidden: false, itemName: "Explorer's ring 4", progressTarget: 5 },
  { key: "eager_beaver", name: "Eager beaver", description: "Mark your interest in a tile", flavor: "You've got this one covered", hidden: false, itemName: "Beaver" },
  { key: "superfan", name: "Superfan", description: "React to a submission from every teammate", flavor: "You get a reaction, you get a reaction, everyone gets a reaction!", hidden: true, itemName: "Hand fan" },
  { key: "popular", name: "Popular", description: "Receive 5 reactions to one of your submissions", flavor: "Slaaaay bitch!", hidden: true, itemName: "Red flowers" },
  { key: "leech", name: "Leech", description: "Open a clue scroll mid-bingo", flavor: "?????", hidden: true, itemName: "Reward casket (master)" },
  { key: "night_owl", name: "Night owl", description: "Submit a drop between 2am and 6am", flavor: "Sleep is for the people not playing bingo", hidden: true, itemName: "Bullseye lantern" },
  { key: "early_bird", name: "Early bird", description: "Submit a drop between 6am and 9am", flavor: "The early bird gets the drop", hidden: true, itemName: "Bird nest" },
  { key: "main_character", name: "Main character", description: "React to your own submission", flavor: "You're your own biggest fan", hidden: true, itemName: "Mirror" },
  { key: "called_it", name: "Called it", description: "Submit a drop for a part you marked interest in", flavor: "If you call the tbow every raid, you know it doesn't count when you get it right?", hidden: true, itemName: "Improved Reflexes" },
  { key: "rules_lawyer", name: "Teacher's pet", description: "Read the rules", flavor: "\"Out of a sea of players, just know that you're my favorite\" - Jedi", hidden: true, itemName: "Book of Knowledge" },
  { key: "number_cruncher", name: "Number cruncher", description: "Check out the stats", flavor: "Calc is short for calculator btw", hidden: true, itemName: "Stats icon" },
];

export const ACHIEVEMENT_KEYS: readonly AchievementKey[] = ACHIEVEMENTS.map((a) => a.key);

const BY_KEY = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));

export function achievementDef(key: AchievementKey): AchievementDef {
  const def = BY_KEY.get(key);
  if (!def) throw new Error(`Unknown achievement key: ${key}`);
  return def;
}

export function isAchievementKey(value: unknown): value is AchievementKey {
  return typeof value === "string" && BY_KEY.has(value as AchievementKey);
}

/** One counted Achievement's progress, e.g. "4/10". */
export interface AchievementProgress {
  current: number;
  target: number;
}

/**
 * One Achievement as sent to the signed-in Player (GET my achievements): a locked Hidden one is masked — no name,
 * description, flavour or icon — so it can't be spoiled by inspecting the page (see getMyAchievements).
 */
export interface MyAchievement {
  key: AchievementKey;
  hidden: boolean;
  masked: boolean;
  name: string | null;
  description: string | null;
  /** Only once earned — a locked Achievement, Hidden or not, doesn't show its flavour yet. */
  flavor: string | null;
  itemName: string | null;
  earned: boolean;
  /** ISO, only when earned. */
  earnedAt: string | null;
  /** Only for counted Achievements (Cheerleader, Regular, Globetrotter, Drop detective). */
  progress: AchievementProgress | null;
}

export interface MyAchievementsResponse {
  achievements: MyAchievement[];
  /** Earned-but-not-yet-shown popups, oldest first — the order the unlock popups should play in. */
  unshownPopups: AchievementKey[];
}

/** For a player card: earned / total switched-on (Hidden ones included). */
export interface AchievementCount {
  earned: number;
  total: number;
}
