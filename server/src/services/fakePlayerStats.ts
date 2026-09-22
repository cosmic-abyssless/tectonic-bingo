// Fabricated WOM/RuneProfile/combat-achievement stats for the generate-bingo test-data script (see
// devTestDataService.ts) — never a live network call. This used to also back a "seed test signups" mod-panel dev
// tool (removed — generate-bingo covers that need directly, with the real player pool it draws from and the
// realistic pacing it simulates), but the fabrication logic itself is still exactly what generate-bingo needs to
// give its synthetic signups realistic-looking EHB/account-type/CA variety without hitting the real APIs.
import { deriveCombatAchievements } from "./combatAchievements";

function weightedPick<T extends string>(weights: Array<[T, number]>): T {
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [value, w] of weights) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return weights[weights.length - 1]![0];
}

// Weighted roughly like a real clan's composition: mostly mains, then
// ironmen, then progressively rarer hardcore/ultimate/group variants —
// close to what the actual clan's WOM group looked like when checked.
const FAKE_RUNEPROFILE_TYPE_WEIGHTS: Array<[string, number]> = [
  ["normal", 55],
  ["ironman", 25],
  ["group_ironman", 10],
  ["unranked_group_ironman", 5],
  ["hardcore_ironman", 3],
  ["ultimate_ironman", 1],
  ["hardcore_group_ironman", 1],
];
const FAKE_WOM_TYPE_WEIGHTS: Array<[string, number]> = [
  ["regular", 60],
  ["ironman", 30],
  ["hardcore", 6],
  ["ultimate", 4],
];

const FAKE_CA_TIER_WEIGHTS: Array<[string, number]> = [
  ["none", 8],
  ["easy", 18],
  ["medium", 22],
  ["hard", 22],
  ["elite", 16],
  ["master", 10],
  ["grandmaster", 4],
];

// Totals are fictional; only completed × point-value matters for deriveCombatAchievements.
const FAKE_CA_COMPLETIONS: Record<string, Array<{ name: string; completed: number; total: number }>> = {
  none: [
    { name: "Easy", completed: 0, total: 50 },
    { name: "Medium", completed: 0, total: 80 },
    { name: "Hard", completed: 0, total: 90 },
    { name: "Elite", completed: 0, total: 150 },
    { name: "Master", completed: 0, total: 180 },
    { name: "Grandmaster", completed: 0, total: 130 },
  ],
  easy: [
    { name: "Easy", completed: 41, total: 50 },
    { name: "Medium", completed: 0, total: 80 },
    { name: "Hard", completed: 0, total: 90 },
    { name: "Elite", completed: 0, total: 150 },
    { name: "Master", completed: 0, total: 180 },
    { name: "Grandmaster", completed: 0, total: 130 },
  ],
  medium: [
    { name: "Easy", completed: 50, total: 50 },
    { name: "Medium", completed: 60, total: 80 },
    { name: "Hard", completed: 0, total: 90 },
    { name: "Elite", completed: 0, total: 150 },
    { name: "Master", completed: 0, total: 180 },
    { name: "Grandmaster", completed: 0, total: 130 },
  ],
  hard: [
    { name: "Easy", completed: 50, total: 50 },
    { name: "Medium", completed: 80, total: 80 },
    { name: "Hard", completed: 76, total: 90 },
    { name: "Elite", completed: 0, total: 150 },
    { name: "Master", completed: 0, total: 180 },
    { name: "Grandmaster", completed: 0, total: 130 },
  ],
  elite: [
    { name: "Easy", completed: 50, total: 50 },
    { name: "Medium", completed: 80, total: 80 },
    { name: "Hard", completed: 90, total: 90 },
    { name: "Elite", completed: 155, total: 180 },
    { name: "Master", completed: 0, total: 180 },
    { name: "Grandmaster", completed: 0, total: 130 },
  ],
  master: [
    { name: "Easy", completed: 50, total: 50 },
    { name: "Medium", completed: 80, total: 80 },
    { name: "Hard", completed: 90, total: 90 },
    { name: "Elite", completed: 150, total: 180 },
    { name: "Master", completed: 177, total: 180 },
    { name: "Grandmaster", completed: 0, total: 130 },
  ],
  grandmaster: [
    { name: "Easy", completed: 50, total: 50 },
    { name: "Medium", completed: 80, total: 80 },
    { name: "Hard", completed: 90, total: 90 },
    { name: "Elite", completed: 150, total: 150 },
    { name: "Master", completed: 180, total: 180 },
    { name: "Grandmaster", completed: 130, total: 130 },
  ],
};

function fakeCombatAchievementsBlob(): unknown {
  return FAKE_CA_COMPLETIONS[weightedPick(FAKE_CA_TIER_WEIGHTS)];
}

export function fakePlayerStats(rsn: string): { womDataJson: string; runeProfileDataJson: string; caCurrentJson: string | null; caPeakJson: string | null } {
  const ehb = Math.round(Math.random() * 2000 * 100) / 100;
  const ehp = Math.round(Math.random() * 3000 * 100) / 100;
  const womType = weightedPick(FAKE_WOM_TYPE_WEIGHTS);
  const runeProfileType = weightedPick(FAKE_RUNEPROFILE_TYPE_WEIGHTS);
  const combatAchievements = fakeCombatAchievementsBlob();
  const blob = { username: rsn, accountType: { id: 0, key: runeProfileType, name: runeProfileType }, combatAchievements };
  const ca = deriveCombatAchievements(blob);
  const caJson = ca ? JSON.stringify(ca) : null;
  return {
    womDataJson: JSON.stringify({ ehb, ehp, type: womType }),
    runeProfileDataJson: JSON.stringify(blob),
    caCurrentJson: caJson,
    caPeakJson: caJson,
  };
}
