// The fake players: who they are, how good they are, and when they are around.
import { clamp, type Rng } from "./rng";
import { HOUR } from "./timeline";

export interface Player {
  index: number;
  discordId: string;
  /** The RSN they sign up with. */
  name: string;
  /** Their Discord username: a different name from the RSN, like a real player's, so a screen that shows the wrong one is easy to spot. */
  discordName: string;
  /** Filled in once the user exists on the server. */
  userId: string | null;
  /** 0..1: how much a hour of their play is worth, and how much content they can do. */
  skill: number;
  /** Hours played a day. */
  activity: number;
  /** Hours from UTC of where they live. */
  offset: number;
  /** A real dev account given with --me, not a made-up one. */
  isMe: boolean;
  isMod: boolean;
  /** Local hours of day a mod tends to sit down and review (mods only). */
  reviewWindows: number[];
  partnerIndex: number | null;
  signupAt: Date | null;
}

const ADJECTIVES = [
  "Swift", "Mighty", "Sneaky", "Crimson", "Frosty", "Rusty", "Lucky", "Dizzy", "Grumpy", "Noble", "Shady", "Wild", "Silent", "Brave", "Cosmic",
  "Ancient", "Dusty", "Fierce", "Golden", "Hollow", "Iron", "Jolly", "Lazy", "Mystic", "Nimble", "Odd", "Proud", "Quick", "Rogue", "Stormy",
];
const NOUNS = [
  "Pker", "Slayer", "Fletcher", "Miner", "Cooker", "Runner", "Ranger", "Wizard", "Knight", "Rogue", "Hunter", "Smith", "Herald", "Warden", "Scout",
  "Ironman", "Mage", "Archer", "Druid", "Bandit", "Pilot", "Crafter", "Farmer", "Diver", "Raider", "Sailor", "Tinker", "Wanderer", "Guardian", "Nomad",
];
const UTC_OFFSETS: [number, number][] = [[-8, 1], [-6, 3], [-5, 3], [-4, 2], [0, 2], [1, 2], [2, 1], [10, 1]];

export function makePlayers(rng: Rng, count: number, idPrefix: string): Player[] {
  const pool = rng.shuffle(ADJECTIVES.flatMap((a) => NOUNS.map((n) => `${a}${n}`)));
  return Array.from({ length: count }, (_, index) => ({
    index,
    discordId: `${idPrefix}-${index}`,
    name: `${pool[index % pool.length]}${index >= pool.length ? index : ""}`,
    discordName: `${pool[index % pool.length]!.toLowerCase()}_dc${index}`,
    userId: null,
    skill: clamp(rng.normal(0.5, 0.2), 0.1, 0.95),
    activity: clamp(rng.normal(3, 1.2), 0.5, 8),
    offset: rng.weighted(UTC_OFFSETS),
    isMe: false,
    isMod: false,
    reviewWindows: [],
    partnerIndex: null,
    signupAt: null,
  }));
}

/** Pairs off about `fraction` of the players as duo partners. */
export function pairUp(players: Player[], rng: Rng, fraction: number): [Player, Player][] {
  const candidates = rng.shuffle(players.filter((p) => !p.isMe));
  const pairs: [Player, Player][] = [];
  const target = Math.floor((candidates.length * fraction) / 2);
  for (let i = 0; i < target; i++) {
    const a = candidates[2 * i]!;
    const b = candidates[2 * i + 1]!;
    a.partnerIndex = b.index;
    b.partnerIndex = a.index;
    pairs.push([a, b]);
  }
  return pairs;
}

/** Picks the mods (the more active players, mostly) and gives each a few times of day they review at. */
export function chooseMods(players: Player[], rng: Rng, count: number): Player[] {
  const candidates = players.filter((p) => !p.isMe && p.partnerIndex === null).sort((a, b) => b.activity - a.activity);
  const mods = candidates.slice(0, Math.min(count, candidates.length));
  for (const mod of mods) {
    mod.isMod = true;
    mod.reviewWindows = rng.shuffle([7, 8, 9, 12, 13, 14, 18, 21, 22, 23]).slice(0, 3).sort((a, b) => a - b);
  }
  return mods;
}

/** How busy the game is at a local hour: quiet overnight, ticking over by day, busiest in the evening. */
export function activityFactor(localHour: number): number {
  const h = ((Math.floor(localHour) % 24) + 24) % 24;
  if (h >= 2 && h < 9) return 0.02;
  if (h >= 9 && h < 17) return 0.5;
  return 1;
}

const FACTOR_SUM = Array.from({ length: 24 }, (_, h) => activityFactor(h)).reduce((a, b) => a + b, 0);

export function localHour(at: Date, offset: number): number {
  return (at.getUTCHours() + offset + 24) % 24;
}

/** The chance this player is playing during the hour starting at `at`; summed over a day it is their `activity`. */
export function playingProbability(player: Player, at: Date): number {
  return Math.min(1, (player.activity * activityFactor(localHour(at, player.offset))) / FACTOR_SUM);
}

export const hoursBetween = (a: Date, b: Date): number => (b.getTime() - a.getTime()) / HOUR;
