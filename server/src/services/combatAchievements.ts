// Official OSRS Combat Achievement reward tier, derived from a RuneProfile
// full-account blob's combatAchievements[] (completed/total per difficulty).
// Point values and reward thresholds are from the OSRS wiki; task *counts*
// drift with new content, so we never key off those.
import type { CombatAchievementStats, CombatAchievementTier } from "@bingo/shared";

const POINTS_PER_TASK: Record<string, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  elite: 4,
  master: 5,
  grandmaster: 6,
};

const REWARD_THRESHOLDS: Array<{ tier: Exclude<CombatAchievementTier, "none">; points: number }> = [
  { tier: "grandmaster", points: 2697 },
  { tier: "master", points: 1965 },
  { tier: "elite", points: 1100 },
  { tier: "hard", points: 436 },
  { tier: "medium", points: 169 },
  { tier: "easy", points: 41 },
];

const TIER_RANK: Record<CombatAchievementTier, number> = {
  none: 0,
  easy: 1,
  medium: 2,
  hard: 3,
  elite: 4,
  master: 5,
  grandmaster: 6,
};

interface RpCombatAchievementTier {
  name?: unknown;
  completed?: unknown;
  total?: unknown;
}

interface RpCombatAchievementsAccount {
  combatAchievements?: unknown;
}

function asNonNegInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}

function normalizeTierName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const key = name.trim().toLowerCase().replace(/\s+/g, "");
  return key in POINTS_PER_TASK ? key : null;
}

/** Reward-tier snapshot from a RuneProfile full-account blob, or null if the blob has no CA data. */
export function deriveCombatAchievements(raw: unknown): CombatAchievementStats | null {
  if (!raw || typeof raw !== "object") return null;
  const list = (raw as RpCombatAchievementsAccount).combatAchievements;
  if (!Array.isArray(list) || list.length === 0) return null;

  let points = 0;
  let completedAll = true;
  let sawAny = false;
  for (const entry of list as RpCombatAchievementTier[]) {
    const key = normalizeTierName(entry.name);
    if (!key) continue;
    sawAny = true;
    const completed = asNonNegInt(entry.completed);
    const total = asNonNegInt(entry.total);
    points += completed * POINTS_PER_TASK[key]!;
    if (total === 0 || completed < total) completedAll = false;
  }
  if (!sawAny) return null;

  let tier: CombatAchievementTier = "none";
  for (const threshold of REWARD_THRESHOLDS) {
    if (points < threshold.points) continue;
    if (threshold.tier === "grandmaster" && !completedAll) continue;
    tier = threshold.tier;
    break;
  }
  return { tier, points };
}

export function parseStoredCaStats(json: string | null | undefined): CombatAchievementStats | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const { tier, points } = parsed as { tier?: unknown; points?: unknown };
    if (typeof tier !== "string" || !(tier in TIER_RANK)) return null;
    if (typeof points !== "number" || !Number.isFinite(points) || points < 0) return null;
    return { tier: tier as CombatAchievementTier, points: Math.trunc(points) };
  } catch {
    return null;
  }
}

/** Highest reward tier among snapshots; missing accounts are skipped, not treated as None. */
export function peakCombatAchievements(stats: Array<CombatAchievementStats | null>): CombatAchievementStats | null {
  let best: CombatAchievementStats | null = null;
  for (const s of stats) {
    if (!s) continue;
    if (!best || TIER_RANK[s.tier] > TIER_RANK[best.tier] || (s.tier === best.tier && s.points > best.points)) {
      best = s;
    }
  }
  return best;
}
