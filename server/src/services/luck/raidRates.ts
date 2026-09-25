// Hand-written drop rates for the raids, per Player per completion (#195). A raid's
// unique chance depends on points, invocation level and team size, which Wise Old
// Man doesn't count, so each raid assumes one typical run. The item weights are
// the wiki's unique tables. scripts/fetch-drop-rates.ts writes these into the
// snapshot alongside the scraped rates.
import type { Rates } from "./rarity";

/** Every item gets `anyUnique` × its weight ÷ the table's total weight. */
function uniques(anyUnique: number, table: Record<string, number>): Record<string, number> {
  const total = Object.values(table).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(table).map(([item, weight]) => [item, (anyUnique * weight) / total]));
}

// Chambers of Xeric (https://oldschool.runescape.wiki/w/Ancient_chest): 1% unique chance per 8,676 of a Player's
// own points, so it doesn't depend on team size. Olmlet is rolled only with a unique, at 1/53.
const COX_POINTS = 20_000;
const COX_CM_POINTS = 40_000;
const coxUnique = (points: number) => points / 867_600;

const COX_TABLE = {
  "Dexterous prayer scroll": 14,
  "Arcane prayer scroll": 14,
  "Twisted buckler": 4,
  "Dragon hunter crossbow": 4,
  "Dinh's bulwark": 3,
  "Ancestral hat": 4,
  "Ancestral robe top": 4,
  "Ancestral robe bottom": 4,
  "Dragon claws": 3,
  "Elder maul": 2,
  "Kodai insignia": 2,
  "Twisted bow": 2,
};
const COX_CM_TABLE = { ...COX_TABLE, "Dexterous prayer scroll": 12, "Arcane prayer scroll": 12 };

// Theatre of Blood (https://oldschool.runescape.wiki/w/Monumental_chest): a team's purple chance, handed to one
// Player of a 4-man team. Lil' Zik is a tertiary roll per Player: 1/650, or 1/500 in Hard Mode.
const TOB_TEAM_SIZE = 4;
const TOB_TEAM_PURPLE = 0.08;
const TOB_HM_TEAM_PURPLE = 0.09;

const TOB_TABLE = {
  "Avernic defender hilt": 8,
  "Ghrazi rapier": 2,
  "Sanguinesti staff (uncharged)": 2,
  "Justiciar faceguard": 2,
  "Justiciar chestguard": 2,
  "Justiciar legguards": 2,
  "Scythe of Vitur (uncharged)": 1,
};
const TOB_HM_TABLE = { ...TOB_TABLE, "Avernic defender hilt": 7 };

// Tombs of Amascut at raid level 400 (https://oldschool.runescape.wiki/w/Chest_(Tombs_of_Amascut)): a team's purple
// chance goes from 6% solo to 30% at 8-man, straight between the two, handed to one Player of the team. The unique
// weights are the wiki's raid level 400 row. The pet uses the same points as a purple, at 1% per 70,000 points instead
// of 1% per 3,700. Thread of Elidinis and the keris jewels are tertiary rolls at their base rates.
const TOA_TEAM_SIZE = 3;
const toaTeamPurple = (teamSize: number) => 0.06 + ((0.3 - 0.06) * (teamSize - 1)) / 7;
const TOA_PURPLE = toaTeamPurple(TOA_TEAM_SIZE) / TOA_TEAM_SIZE;

const TOA_TABLE = {
  "Osmumten's fang": 4,
  Lightbearer: 5,
  "Elidinis' ward": 3,
  "Masori mask": 2,
  "Masori body": 2,
  "Masori chaps": 2,
  "Tumeken's shadow (uncharged)": 1,
};

export const RAID_RATES: Rates = {
  "Chambers of Xeric": {
    ...uniques(coxUnique(COX_POINTS), COX_TABLE),
    Olmlet: coxUnique(COX_POINTS) / 53,
  },
  "Chambers of Xeric (Challenge Mode)": {
    ...uniques(coxUnique(COX_CM_POINTS), COX_CM_TABLE),
    Olmlet: coxUnique(COX_CM_POINTS) / 53,
    "Twisted ancestral colour kit": 1 / 75,
    "Metamorphic dust": 1 / 400,
  },
  "Theatre of Blood": {
    ...uniques(TOB_TEAM_PURPLE / TOB_TEAM_SIZE, TOB_TABLE),
    "Lil' Zik": 1 / 650,
  },
  "Theatre of Blood (Hard Mode)": {
    ...uniques(TOB_HM_TEAM_PURPLE / TOB_TEAM_SIZE, TOB_HM_TABLE),
    "Lil' Zik": 1 / 500,
  },
  "Tombs of Amascut": {
    ...uniques(TOA_PURPLE, TOA_TABLE),
    "Tumeken's guardian": (TOA_PURPLE * 3_700) / 70_000,
    "Thread of Elidinis": 1 / 10,
    "Eye of the Corruptor": 1 / 50,
    "Jewel of the Sun": 1 / 50,
    "Breach of the Scarab": 1 / 50,
    "Jewel of Amascut": 1 / 50,
  },
};
