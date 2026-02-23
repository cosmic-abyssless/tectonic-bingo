import { db } from '../index';
import { bingoEvents, tiles } from '../schema';

const FREEZE = { hasFreezePeriod: true, freezeDurationMinutes: 120 };
const NO_FREEZE = { hasFreezePeriod: false, freezeDurationMinutes: 0 };

// [row, col, name, badgeCategory, totalPoints, freezeOpts]
const TILE_DEFS: [number, number, string, typeof tiles.$inferInsert['badgeCategory'], number, typeof FREEZE | typeof NO_FREEZE][] = [
  // Row 0 — Demonic
  [0, 0, 'Doom of Mokhaiotl',      'demonic',    100, FREEZE],
  [0, 1, 'Cerberus',               'demonic',     65, NO_FREEZE],
  [0, 2, 'Yama',                   'demonic',    100, NO_FREEZE],
  [0, 3, 'Abyssal Sire',           'demonic',     65, NO_FREEZE],
  [0, 4, 'Zalcano',                'demonic',     65, NO_FREEZE],
  [0, 5, 'Duke Sucellus',          'demonic',     65, NO_FREEZE],
  [0, 6, 'Demonic Gorillas',       'demonic',     70, NO_FREEZE],

  // Row 1 — Draconic
  [1, 0, 'COX 1',                  'draconic',   100, FREEZE],
  [1, 1, 'Vorkath',                'draconic',    60, NO_FREEZE],
  [1, 2, 'Hueycoatl',              'draconic',    50, NO_FREEZE],
  [1, 3, 'Fossil Island Wyverns',  'draconic',    55, NO_FREEZE],
  [1, 4, 'Zulrah',                 'draconic',    75, NO_FREEZE],
  [1, 5, 'COX 2',                  'draconic',   100, FREEZE],
  [1, 6, 'Alchemical Hydra',       'draconic',    65, NO_FREEZE],

  // Row 2 — Spectral
  [2, 0, 'Barrows',                'spectral',    65, NO_FREEZE],
  [2, 1, 'Phantom Muspah',         'spectral',    65, NO_FREEZE],
  [2, 2, 'Amoxliatl',              'spectral',    50, NO_FREEZE],
  [2, 3, 'Moons of Peril',         'spectral',    70, NO_FREEZE],
  [2, 4, "Vet'ion",                'spectral',    65, NO_FREEZE],
  [2, 5, 'Revenants',              'spectral',    75, NO_FREEZE],
  [2, 6, 'Whisperer',              'spectral',    65, NO_FREEZE],

  // Row 3 — Animalistic
  [3, 0, 'Gauntlet',               'animalistic', 70, NO_FREEZE],
  [3, 1, 'Callisto',               'animalistic', 65, NO_FREEZE],
  [3, 2, 'Scurrius',               'animalistic', 50, NO_FREEZE],
  [3, 3, 'Pets',                   'animalistic', 50, NO_FREEZE],
  [3, 4, 'Dagannoth Kings',        'animalistic', 65, NO_FREEZE],
  [3, 5, 'Corporeal Beast',        'animalistic', 80, NO_FREEZE],
  [3, 6, 'Sailing',                'animalistic', 70, NO_FREEZE],

  // Row 4 — God Wars
  [4, 0, "K'ril Tsutsaroth",       'god_wars',    70, NO_FREEZE],
  [4, 1, 'Commander Zilyana',      'god_wars',    70, NO_FREEZE],
  [4, 2, 'Wintertodt',             'god_wars',    65, NO_FREEZE],
  [4, 3, 'Nex',                    'god_wars',   100, NO_FREEZE],
  [4, 4, "Kree'arra",              'god_wars',    70, NO_FREEZE],
  [4, 5, 'General Graardor',       'god_wars',    70, NO_FREEZE],
  [4, 6, 'Tormented Demons',       'god_wars',    65, NO_FREEZE],

  // Row 5 — Vampyric
  [5, 0, 'Blood Shards',           'vampyric',    50, NO_FREEZE],
  [5, 1, 'TOB 1',                  'vampyric',   100, FREEZE],
  [5, 2, 'Araxxor',                'vampyric',    65, NO_FREEZE],
  [5, 3, 'Vardorvis',              'vampyric',    65, NO_FREEZE],
  [5, 4, 'TOB 2',                  'vampyric',   100, FREEZE],
  [5, 5, 'Nightmare',              'vampyric',   100, NO_FREEZE],
  [5, 6, 'Venenatis',              'vampyric',    65, NO_FREEZE],

  // Row 6 — Desert
  [6, 0, 'Colosseum',              'desert',     100, FREEZE],
  [6, 1, 'Pyramid Plunder',        'desert',      55, NO_FREEZE],
  [6, 2, 'TOA 1',                  'desert',     100, FREEZE],
  [6, 3, 'GOTR',                   'desert',      65, NO_FREEZE],
  [6, 4, 'Leviathan',              'desert',      65, NO_FREEZE],
  [6, 5, 'Tempoross',              'desert',      65, NO_FREEZE],
  [6, 6, 'TOA 2',                  'desert',     100, FREEZE],
];

async function seed() {
  const [event] = await db.select().from(bingoEvents).limit(1);
  if (!event) {
    console.error('No bingo event found — run 01-event.ts first.');
    process.exit(1);
  }

  const existing = await db.select().from(tiles).limit(1);
  if (existing.length > 0) {
    console.log('tiles already seeded, skipping.');
    return;
  }

  await db.insert(tiles).values(
    TILE_DEFS.map(([boardRow, boardCol, name, badgeCategory, totalPoints, freeze]) => ({
      bingoEventId: event.id,
      boardRow,
      boardCol,
      name,
      badgeCategory,
      totalPoints,
      ...freeze,
    }))
  );

  console.log(`Seeded ${TILE_DEFS.length} tiles.`);
}

seed().catch((err) => { console.error(err); process.exit(1); });
