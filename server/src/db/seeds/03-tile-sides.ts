import { db } from "../index";
import { bingoEvents, tiles, tileSides } from "../schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SideDef = {
  side: "A" | "B";
  points: number;
  description: string;
  requiresNoDuplicates?: boolean;
  allowsPreviouslyAcquired?: boolean;
  allowsPreLoad?: boolean;
  requiresPartA?: boolean;
  // How many approved submissions are required before this side is marked complete.
  // Defaults to 1. Use >1 for "obtain N of these" tiles where each item is qty=1 in an optgroup.
  minSubmissions?: number;
  // When true, completion requires ALL items in at least ONE options group to be approved.
  // Used by Barrows Part B: must submit a complete set from one brother.
  requiresCompleteSet?: boolean;
  notes?: string;
};

type TileSideDef = { tileName: string; sides: [SideDef, SideDef] };

// ---------------------------------------------------------------------------
// Data — one entry per tile, always [Part A, Part B]
// ---------------------------------------------------------------------------

const DEFS: TileSideDef[] = [
  // ── DEMONIC ──────────────────────────────────────────────────────────────

  {
    tileName: "Doom of Mokhaiotl",
    sides: [
      {
        side: "A",
        points: 40,
        description:
          "Obtain a Doom unique (Mokhaiotl Cloth, Eye of Ayak, or Avernic Treads). Uniques must be claimed to count.",
      },
      {
        side: "B",
        points: 60,
        description: "Obtain a different Doom unique (no duplicates).",
        requiresNoDuplicates: true,
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "Cerberus",
    sides: [
      {
        side: "A",
        points: 25,
        description:
          "Obtain any 2 uniques from Cerberus. Duplicates are allowed.",
        minSubmissions: 2,
      },
      {
        side: "B",
        points: 40,
        description:
          "Obtain all 4 Cerberus uniques: Primordial crystal, Pegasian crystal, Eternal crystal, and Smouldering stone. Previously acquired uniques count.",
        allowsPreviouslyAcquired: true,
        requiresNoDuplicates: true,
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "Yama",
    sides: [
      {
        side: "A",
        points: 40,
        description:
          "Obtain a piece of Oathplate Armor (helm, chest, or legs). Oathplate via forgotten lockbox counts.",
        notes:
          "Screenshot the reward message or provide a pre-clog screenshot. Contracts of acquisition may not be used.",
      },
      {
        side: "B",
        points: 60,
        description:
          "Obtain another piece of Oathplate Armor. Duplicates are allowed.",
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "Abyssal Sire",
    sides: [
      {
        side: "A",
        points: 25,
        description: "Obtain 2 Unsired. Pre-stacking Unsired is not allowed.",
      },
      {
        side: "B",
        points: 40,
        description:
          "Obtain any 3 pieces of an Abyssal bludgeon (spine, limb, or axon).",
      },
    ],
  },
  {
    tileName: "Zalcano",
    sides: [
      {
        side: "A",
        points: 25,
        description: "Obtain either a Zalcano Shard or a Crystal Tool Seed.",
      },
      {
        side: "B",
        points: 40,
        description:
          "Obtain the other item (whichever was not obtained for Part A).",
        allowsPreviouslyAcquired: true,
        requiresNoDuplicates: true,
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "Duke Sucellus",
    sides: [
      {
        side: "A",
        points: 20,
        description:
          "Obtain 1 ring roll from Duke Sucellus. The first guaranteed ring drop after a long break does not count.",
      },
      {
        side: "B",
        points: 45,
        description:
          "Obtain 2 more ring rolls from Duke Sucellus. The first guaranteed ring drop after a long break does not count.",
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "Demonic Gorillas",
    sides: [
      {
        side: "A",
        points: 35,
        description:
          "Obtain any 3 drops from Demonic Gorillas (dupes fine): Zenyte, Ballista Limbs, Ballista Spring, or Light Frame.",
        minSubmissions: 3,
      },
      {
        side: "B",
        points: 35,
        description: "Obtain a Heavy Frame or a Monkey Tail.",
      },
    ],
  },

  // ── DRACONIC ─────────────────────────────────────────────────────────────

  {
    tileName: "COX 1",
    sides: [
      {
        side: "A",
        points: 40,
        description:
          "Obtain 1 of each prayer scroll: Torn Prayer Scroll, Dexterous Prayer Scroll, and Arcane Prayer Scroll.",
      },
      {
        side: "B",
        points: 60,
        description:
          "Obtain any piece of Ancestral robes (hat, top, or bottoms).",
      },
    ],
  },
  {
    tileName: "Vorkath",
    sides: [
      { side: "A", points: 25, description: "Obtain 5 Vorkath heads." },
      {
        side: "B",
        points: 35,
        description:
          "Obtain a rare drop from Vorkath: Dragonbone Necklace, Skeletal Visage, Draconic Visage (must come from Vorkath), or Vorkath's jar.",
      },
    ],
  },
  {
    tileName: "Hueycoatl",
    sides: [
      { side: "A", points: 25, description: "Obtain 9 Hueycoatl hides." },
      { side: "B", points: 25, description: "Obtain a Dragon Hunter Wand." },
    ],
  },
  {
    tileName: "Fossil Island Wyverns",
    sides: [
      {
        side: "A",
        points: 20,
        description: "Obtain a Granite Longsword or Granite Boots.",
      },
      {
        side: "B",
        points: 35,
        description:
          "Obtain the other item (whichever was not obtained for Part A).",
        allowsPreviouslyAcquired: true,
        requiresNoDuplicates: true,
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "Zulrah",
    sides: [
      {
        side: "A",
        points: 25,
        description: "Obtain any 2 Zulrah uniques. Duplicates are allowed.",
        minSubmissions: 2,
      },
      {
        side: "B",
        points: 50,
        description:
          "Obtain all 4 Zulrah uniques: Serpentine Visage, Tanzanite Fang, Magic Fang, and Uncut Onyx. Previously acquired uniques count.",
        allowsPreviouslyAcquired: true,
        requiresNoDuplicates: true,
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "COX 2",
    sides: [
      {
        side: "A",
        points: 40,
        description:
          "Obtain any 3 COX purples. Duplicates are allowed. Items must be separate drops from those submitted for COX 1.",
        minSubmissions: 3,
      },
      {
        side: "B",
        points: 60,
        description:
          "Obtain 2 Twisted Ancestral Colour Kits OR 1 Metamorphic Dust.",
      },
    ],
  },
  {
    tileName: "Alchemical Hydra",
    sides: [
      {
        side: "A",
        points: 25,
        description:
          "Obtain any 2 Hydra uniques. Duplicates are allowed. Options: Brimstone Ring piece, Hydra Tail, Hydra Leather, Hydra Claw, Hydra Heads, Hydra Jar.",
        minSubmissions: 2,
      },
      {
        side: "B",
        points: 40,
        description:
          "Obtain 3 additional Hydra uniques. Duplicates are allowed.",
        requiresPartA: true,
        minSubmissions: 3,
      },
    ],
  },

  // ── SPECTRAL ─────────────────────────────────────────────────────────────

  {
    tileName: "Barrows",
    sides: [
      {
        side: "A",
        points: 30,
        description:
          "Obtain 12 pieces of Barrows armour. Duplicates are allowed.",
        allowsPreLoad: true,
        minSubmissions: 12,
      },
      {
        side: "B",
        points: 35,
        description:
          "Obtain any complete set of Barrows armour (helmet, torso, legs, weapon).",
        allowsPreviouslyAcquired: true,
        requiresNoDuplicates: true,
        requiresPartA: true,
        requiresCompleteSet: true,
      },
    ],
  },
  {
    tileName: "Phantom Muspah",
    sides: [
      {
        side: "A",
        points: 25,
        description:
          "Obtain 2 Venator shards. Shards from a frozen cache count.",
        notes:
          "Screenshot the reward message or provide a pre-clog screenshot.",
      },
      {
        side: "B",
        points: 40,
        description: "Obtain 3 more Venator shards.",
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "Amoxliatl",
    sides: [
      { side: "A", points: 20, description: "Obtain 10 Pendants of Ates." },
      { side: "B", points: 30, description: "Obtain 7 Glacial Temotli." },
    ],
  },
  {
    tileName: "Moons of Peril",
    sides: [
      {
        side: "A",
        points: 35,
        description: "Obtain 5 Moons of Peril uniques. Duplicates are allowed.",
        allowsPreLoad: true,
        minSubmissions: 5,
      },
      {
        side: "B",
        points: 35,
        description:
          "Obtain 5 additional Moons of Peril uniques. Duplicates are allowed.",
        requiresPartA: true,
        minSubmissions: 5,
      },
    ],
  },
  {
    tileName: "Vet'ion",
    sides: [
      { side: "A", points: 25, description: "Obtain a Skull of Vet'ion." },
      {
        side: "B",
        points: 40,
        description:
          "Obtain all of Vet'ion's uniques: Skull of Vet'ion (Part A counts), Voidwaker Blade, and Ring of the Gods.",
        allowsPreviouslyAcquired: true,
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "Revenants",
    sides: [
      {
        side: "A",
        points: 35,
        description:
          "Obtain one item from the Rev uniques list: Amulet of Avarice, Craw's Bow, Thammaron's Sceptre, Viggora's Chainmace, Ancient Crystal, Ancient Statuette, Ancient Medallion, Ancient Effigy, or Ancient Relic. Ancient Emblem and Ancient Totem do not count.",
      },
      {
        side: "B",
        points: 40,
        description:
          "Obtain a different item from the same Rev uniques list (no duplicates).",
        requiresNoDuplicates: true,
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "Whisperer",
    sides: [
      {
        side: "A",
        points: 20,
        description:
          "Obtain 1 ring roll from The Whisperer. The first guaranteed ring drop after a long break does not count.",
      },
      {
        side: "B",
        points: 45,
        description: "Obtain 2 more ring rolls from The Whisperer.",
        requiresPartA: true,
      },
    ],
  },

  // ── ANIMALISTIC ──────────────────────────────────────────────────────────

  {
    tileName: "Gauntlet",
    sides: [
      {
        side: "A",
        points: 35,
        description:
          "Obtain any 3 Gauntlet seeds (Armour seed, Weapon seed, or Enhanced Weapon seed).",
        allowsPreLoad: true,
        minSubmissions: 3,
      },
      {
        side: "B",
        points: 35,
        description: "Obtain an additional 3 Gauntlet seeds.",
        requiresPartA: true,
        minSubmissions: 3,
      },
    ],
  },
  {
    tileName: "Callisto",
    sides: [
      { side: "A", points: 25, description: "Obtain a Claw of Callisto." },
      {
        side: "B",
        points: 40,
        description:
          "Obtain all of Callisto's uniques: Claw of Callisto (Part A counts), Voidwaker Hilt, and Tyrannical Ring.",
        allowsPreviouslyAcquired: true,
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "Scurrius",
    sides: [
      { side: "A", points: 25, description: "Obtain 5 Scurrius spines." },
      {
        side: "B",
        points: 25,
        description: "Obtain 5 more Scurrius spines.",
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "Pets",
    sides: [
      {
        side: "A",
        points: 25,
        description:
          "Obtain a pet. Excluded pets: Chompy Bird, Skotizo, Chaos Elemental, Quetzin, Lil Creator, Penance Queen, Jad, Zuk, Smol Heredit.",
      },
      {
        side: "B",
        points: 25,
        description:
          "Obtain an additional pet (must be obtained by a different team member). Same exclusions apply.",
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "Dagannoth Kings",
    sides: [
      {
        side: "A",
        points: 25,
        description: "Obtain any 4 DKS rings. Duplicates are allowed.",
        minSubmissions: 4,
      },
      {
        side: "B",
        points: 40,
        description: "Obtain 6 more DKS rings. Duplicates are allowed.",
        requiresPartA: true,
        minSubmissions: 6,
      },
    ],
  },
  {
    tileName: "Corporeal Beast",
    sides: [
      {
        side: "A",
        points: 35,
        description: "Obtain a Spirit Shield and a Holy Elixir.",
      },
      {
        side: "B",
        points: 45,
        description:
          "Obtain a sigil (Elysian, Spectral, or Arcane) or the Corporeal Beast jar.",
      },
    ],
  },
  {
    tileName: "Sailing",
    sides: [
      {
        side: "A",
        points: 25,
        description:
          "Obtain one item from the Sailing list: Broken Dragon Hook, Dragon Cannon Barrel, or Bottled Storm.",
      },
      {
        side: "B",
        points: 45,
        description:
          "Obtain all items from the Sailing list: Broken Dragon Hook, Dragon Cannon Barrel, and Bottled Storm.",
        allowsPreviouslyAcquired: true,
        requiresNoDuplicates: true,
        requiresPartA: true,
      },
    ],
  },

  // ── GOD WARS ─────────────────────────────────────────────────────────────

  {
    tileName: "K'ril Tsutsaroth",
    sides: [
      {
        side: "A",
        points: 35,
        description:
          "Obtain 2 different drops from K'ril Tsutsaroth (Steam Battlestaff, Zamorakian Spear, or Staff of the Dead).",
        requiresNoDuplicates: true,
        minSubmissions: 2,
      },
      {
        side: "B",
        points: 35,
        description:
          "Obtain a Zamorak Hilt or your 3rd missing unique from the K'ril list.",
        requiresNoDuplicates: true,
      },
    ],
  },
  {
    tileName: "Commander Zilyana",
    sides: [
      {
        side: "A",
        points: 35,
        description:
          "Obtain 2 different drops from Commander Zilyana (Saradomin Sword, Saradomin's Light, or Armadyl Crossbow).",
        requiresNoDuplicates: true,
        minSubmissions: 2,
      },
      {
        side: "B",
        points: 35,
        description:
          "Obtain a Saradomin Hilt or your 3rd missing unique from the Zilyana list.",
        requiresNoDuplicates: true,
      },
    ],
  },
  {
    tileName: "Wintertodt",
    sides: [
      {
        side: "A",
        points: 25,
        description:
          "Obtain 200 burnt pages. Each Pyromancer piece, Bruma Torch, or duplicate Tome of Fire counts as 25 pages.",
        notes: "Pre-screenshot of empty WT cart required before starting.",
      },
      { side: "B", points: 40, description: "Obtain a Tome of Fire." },
    ],
  },
  {
    tileName: "Nex",
    sides: [
      {
        side: "A",
        points: 40,
        description:
          "Obtain a Nex drop: Zaryte Vambraces, Nihil Horn, Torva Full Helm, Torva Platebody, Torva Platelegs, or Ancient Hilt.",
      },
      {
        side: "B",
        points: 60,
        description: "Obtain a different Nex drop (no duplicates).",
        requiresNoDuplicates: true,
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "Kree'arra",
    sides: [
      {
        side: "A",
        points: 35,
        description:
          "Obtain 2 different drops from Kree'arra (Armadyl Chestplate, Armadyl Chainskirt, or Armadyl Helmet).",
        requiresNoDuplicates: true,
        minSubmissions: 2,
      },
      {
        side: "B",
        points: 35,
        description:
          "Obtain an Armadyl Hilt or your 3rd missing unique from the Kree'arra list.",
        requiresNoDuplicates: true,
      },
    ],
  },
  {
    tileName: "General Graardor",
    sides: [
      {
        side: "A",
        points: 35,
        description:
          "Obtain 2 different drops from General Graardor (Bandos Chestplate, Bandos Tassets, or Bandos Boots).",
        requiresNoDuplicates: true,
        minSubmissions: 2,
      },
      {
        side: "B",
        points: 35,
        description:
          "Obtain a Bandos Hilt or your 3rd missing unique from the Graardor list.",
        requiresNoDuplicates: true,
      },
    ],
  },
  {
    tileName: "Tormented Demons",
    sides: [
      {
        side: "A",
        points: 25,
        description: "Obtain a Burning Claw or a Synapse.",
      },
      {
        side: "B",
        points: 40,
        description: "Obtain 2 more Burning Claws and/or Synapses.",
        minSubmissions: 2,
        requiresPartA: true,
      },
    ],
  },

  // ── VAMPYRIC ─────────────────────────────────────────────────────────────

  {
    tileName: "Blood Shards",
    sides: [
      {
        side: "A",
        points: 20,
        description: "Obtain 2 Blood Shards.",
        notes:
          "If thieving, submit a pre-screenshot of your collection log showing your current blood shard count.",
      },
      {
        side: "B",
        points: 30,
        description: "Obtain 3 more Blood Shards.",
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "TOB 1",
    sides: [
      {
        side: "A",
        points: 40,
        description:
          "Obtain a piece of Justiciar Armour (Faceguard, Chestguard, or Legguards).",
      },
      {
        side: "B",
        points: 60,
        description:
          "Obtain a different piece of Justiciar Armour (no duplicates).",
        requiresNoDuplicates: true,
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "Araxxor",
    sides: [
      {
        side: "A",
        points: 25,
        description:
          "Obtain any 2 Araxxor uniques. Duplicates are allowed. Options: Noxious Halberd piece, Araxyte Fang, Araxyte Head, Jar of Venom.",
        minSubmissions: 2,
      },
      {
        side: "B",
        points: 40,
        description: "Obtain 2 more Araxxor uniques. Duplicates are allowed.",
        requiresPartA: true,
        minSubmissions: 2,
      },
    ],
  },
  {
    tileName: "Vardorvis",
    sides: [
      {
        side: "A",
        points: 20,
        description:
          "Obtain 1 ring roll from Vardorvis. The first guaranteed ring drop after a long break does not count.",
      },
      {
        side: "B",
        points: 45,
        description: "Obtain 2 more ring rolls from Vardorvis.",
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "TOB 2",
    sides: [
      {
        side: "A",
        points: 40,
        description: "Obtain an Avernic Defender Hilt.",
      },
      {
        side: "B",
        points: 60,
        description:
          "Obtain a raid weapon: Ghrazi Rapier, Sanguinesti Staff, or Scythe of Vitur.",
      },
    ],
  },
  {
    tileName: "Nightmare",
    sides: [
      {
        side: "A",
        points: 40,
        description:
          "Obtain any Nightmare drop: Nightmare Staff, Inquisitor's Great Helm, Inquisitor's Hauberk, Inquisitor's Plateskirt, Inquisitor's Mace, Eldritch Orb, Harmonised Orb, Volatile Orb, or Jar.",
      },
      {
        side: "B",
        points: 60,
        description: "Obtain a different Nightmare drop (no duplicates).",
        requiresNoDuplicates: true,
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "Venenatis",
    sides: [
      { side: "A", points: 25, description: "Obtain a Fang of Venenatis." },
      {
        side: "B",
        points: 40,
        description:
          "Obtain all of Venenatis' uniques: Fang of Venenatis (Part A counts), Voidwaker Gem, and Treasonous Ring.",
        allowsPreviouslyAcquired: true,
        requiresPartA: true,
      },
    ],
  },

  // ── DESERT ───────────────────────────────────────────────────────────────

  {
    tileName: "Colosseum",
    sides: [
      {
        side: "A",
        points: 40,
        description:
          "Obtain 2 Echo Crystals. Must complete the wave and claim the item.",
      },
      {
        side: "B",
        points: 60,
        description:
          "Obtain 2 Sunfire pieces (Sunfire Fanatic helm, cuirass, or chausses). Must complete the wave and claim the item.",
        minSubmissions: 2,
      },
    ],
  },
  {
    tileName: "Pyramid Plunder",
    sides: [
      { side: "A", points: 20, description: "Obtain a Pharaoh's Sceptre." },
      {
        side: "B",
        points: 35,
        description: "Obtain 2 more Pharaoh's Sceptres.",
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "TOA 1",
    sides: [
      { side: "A", points: 40, description: "Obtain a Lightbearer." },
      {
        side: "B",
        points: 60,
        description: "Obtain a Osmumten's Fang and an Elidinis' Ward.",
      },
    ],
  },
  {
    tileName: "GOTR",
    sides: [
      {
        side: "A",
        points: 25,
        description:
          "Obtain an Abyssal Lantern from the Guardians of the Rift. Must be obtained from the rift — purchasing is not allowed.",
        notes: "Pre-screenshot of empty rift required before starting.",
      },
      {
        side: "B",
        points: 40,
        description:
          "Obtain 2 Abyssal Dyes from the Guardians of the Rift. Duplicates are allowed.",
      },
    ],
  },
  {
    tileName: "Leviathan",
    sides: [
      {
        side: "A",
        points: 20,
        description:
          "Obtain 1 ring roll from The Leviathan. The first guaranteed ring drop after a long break does not count.",
      },
      {
        side: "B",
        points: 45,
        description: "Obtain 2 more ring rolls from The Leviathan.",
        requiresPartA: true,
      },
    ],
  },
  {
    tileName: "Tempoross",
    sides: [
      {
        side: "A",
        points: 25,
        description:
          "Obtain 200 soaked pages. A duplicate Tome of Water or a Big Harpoonfish each counts as 25 pages.",
        notes: "Pre-screenshot of empty reward pool required before starting.",
      },
      { side: "B", points: 40, description: "Obtain a Tome of Water." },
    ],
  },
  {
    tileName: "TOA 2",
    sides: [
      {
        side: "A",
        points: 40,
        description:
          "Obtain any piece of Masori armour (mask, body, or chaps).",
      },
      {
        side: "B",
        points: 60,
        description:
          "Obtain a different piece of Masori armour (no duplicates).",
        requiresNoDuplicates: true,
        requiresPartA: true,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed() {
  const [event] = await db.select().from(bingoEvents).limit(1);
  if (!event) {
    console.error("No bingo event — run 01-event.ts first.");
    process.exit(1);
  }

  const existing = await db.select().from(tileSides).limit(1);
  if (existing.length > 0) {
    console.log("tile_sides already seeded, skipping.");
    return;
  }

  const allTiles = await db
    .select()
    .from(tiles)
    .where(eq(tiles.bingoEventId, event.id));
  const tileByName = new Map(allTiles.map((t) => [t.name, t]));

  const rows = DEFS.flatMap(({ tileName, sides }) => {
    const tile = tileByName.get(tileName);
    if (!tile)
      throw new Error(`Tile not found: "${tileName}" — run 02-tiles.ts first.`);
    return sides.map((s) => ({
      tileId: tile.id,
      side: s.side,
      points: s.points,
      description: s.description,
      requiresNoDuplicates: s.requiresNoDuplicates ?? false,
      allowsPreviouslyAcquired: s.allowsPreviouslyAcquired ?? false,
      allowsPreLoad: s.allowsPreLoad ?? false,
      requiresPartA: s.requiresPartA ?? false,
      minSubmissions: s.minSubmissions ?? 1,
      requiresCompleteSet: s.requiresCompleteSet ?? false,
      notes: s.notes ?? null,
    }));
  });

  await db.insert(tileSides).values(rows);
  console.log(
    `Seeded ${rows.length} tile sides (${rows.length / 2} tiles × 2).`,
  );
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
