import { db } from "../index";
import { bingoEvents, tiles, tileSides, tileSideItems } from "../schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ItemDef = {
  itemName: string;
  quantity?: number;
  optionsGroup?: string;
  sortOrder?: number;
};

type SideItemsDef = {
  tileName: string;
  side: "A" | "B";
  items: ItemDef[];
};

// ---------------------------------------------------------------------------
// Helper — build a sorted item list
// ---------------------------------------------------------------------------

function items(...defs: (ItemDef | ItemDef[])[]): ItemDef[] {
  return defs.flat().map((d, i) => ({ sortOrder: i, ...d }));
}

function opts(group: string, names: string[], qty = 1): ItemDef[] {
  return names.map((itemName, i) => ({
    itemName,
    quantity: qty,
    optionsGroup: group,
    sortOrder: i,
  }));
}

function req(...names: string[]): ItemDef[] {
  return names.map((itemName, i) => ({ itemName, quantity: 1, sortOrder: i }));
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const DEFS: SideItemsDef[] = [
  // ── DEMONIC ──────────────────────────────────────────────────────────────

  {
    tileName: "Doom of Mokhaiotl",
    side: "A",
    items: opts("doom_unique", [
      "Mokhaiotl Cloth",
      "Eye of Ayak",
      "Avernic Treads",
    ]),
  },
  {
    tileName: "Doom of Mokhaiotl",
    side: "B",
    items: opts("doom_unique", [
      "Mokhaiotl Cloth",
      "Eye of Ayak",
      "Avernic Treads",
    ]),
  },

  {
    tileName: "Cerberus",
    side: "A",
    items: opts("cerberus_unique", [
      "Primordial crystal",
      "Pegasian crystal",
      "Eternal crystal",
      "Smouldering stone",
    ]),
  },
  {
    tileName: "Cerberus",
    side: "B",
    items: req(
      "Primordial crystal",
      "Pegasian crystal",
      "Eternal crystal",
      "Smouldering stone",
    ),
  },

  {
    tileName: "Yama",
    side: "A",
    items: opts("oathplate", [
      "Oathplate helm",
      "Oathplate chest",
      "Oathplate legs",
    ]),
  },
  {
    tileName: "Yama",
    side: "B",
    items: opts("oathplate", [
      "Oathplate helm",
      "Oathplate chest",
      "Oathplate legs",
    ]),
  },

  {
    tileName: "Abyssal Sire",
    side: "A",
    items: items({ itemName: "Unsired", quantity: 2 }),
  },
  {
    tileName: "Abyssal Sire",
    side: "B",
    items: opts("bludgeon_piece", [
      "Abyssal bludgeon spine",
      "Abyssal bludgeon limb",
      "Abyssal bludgeon axon",
    ]),
  },

  {
    tileName: "Zalcano",
    side: "A",
    items: opts("zalcano_item", ["Zalcano shard", "Crystal tool seed"]),
  },
  {
    tileName: "Zalcano",
    side: "B",
    items: opts("zalcano_item", ["Zalcano shard", "Crystal tool seed"]),
  },

  {
    tileName: "Duke Sucellus",
    side: "A",
    items: items({ itemName: "Magus vestige", quantity: 1 }),
  },
  {
    tileName: "Duke Sucellus",
    side: "B",
    items: items({ itemName: "Magus vestige", quantity: 2 }),
  },

  {
    tileName: "Demonic Gorillas",
    side: "A",
    items: opts("demonics_a", [
      "Zenyte shard",
      "Ballista limbs",
      "Ballista spring",
      "Light frame",
    ]),
  },
  {
    tileName: "Demonic Gorillas",
    side: "B",
    items: opts("demonics_b", ["Heavy frame", "Monkey tail"]),
  },

  // ── DRACONIC ─────────────────────────────────────────────────────────────

  {
    tileName: "COX 1",
    side: "A",
    items: req(
      "Torn prayer scroll",
      "Dexterous prayer scroll",
      "Arcane prayer scroll",
    ),
  },
  {
    tileName: "COX 1",
    side: "B",
    items: opts("ancestral", [
      "Ancestral hat",
      "Ancestral top",
      "Ancestral robe bottom",
    ]),
  },

  {
    tileName: "Vorkath",
    side: "A",
    items: items({ itemName: "Vorkath's head", quantity: 5 }),
  },
  {
    tileName: "Vorkath",
    side: "B",
    items: opts("vorkath_rare", [
      "Dragonbone necklace",
      "Skeletal visage",
      "Draconic visage",
      "Vorkath's jar",
    ]),
  },

  {
    tileName: "Hueycoatl",
    side: "A",
    items: items({ itemName: "Hueycoatl hide", quantity: 9 }),
  },
  { tileName: "Hueycoatl", side: "B", items: req("Dragon hunter wand") },

  {
    tileName: "Fossil Island Wyverns",
    side: "A",
    items: opts("wyvern_item", ["Granite longsword", "Granite boots"]),
  },
  {
    tileName: "Fossil Island Wyverns",
    side: "B",
    items: opts("wyvern_item", ["Granite longsword", "Granite boots"]),
  },

  {
    tileName: "Zulrah",
    side: "A",
    items: opts("zulrah_unique", [
      "Serpentine visage",
      "Tanzanite fang",
      "Magic fang",
      "Uncut onyx",
    ]),
  },
  {
    tileName: "Zulrah",
    side: "B",
    items: req(
      "Serpentine visage",
      "Tanzanite fang",
      "Magic fang",
      "Uncut onyx",
    ),
  },

  {
    tileName: "COX 2",
    side: "A",
    items: opts("cox_purple", [
      "Twisted bow",
      "Kodai insignia",
      "Elder maul",
      "Dinh's bulwark",
      "Dragon hunter crossbow",
      "Ancestral hat",
      "Ancestral top",
      "Ancestral robe bottom",
      "Dexterous prayer scroll",
      "Arcane prayer scroll",
      "Torn prayer scroll",
      "Twisted ancestral colour kit",
      "Metamorphic dust",
    ]),
  },
  {
    tileName: "COX 2",
    side: "B",
    items: items(
      // 2 kits OR 1 dust — both in the same options group; moderator verifies the OR logic
      {
        itemName: "Twisted ancestral colour kit",
        quantity: 2,
        optionsGroup: "cox2_b",
      },
      { itemName: "Metamorphic dust", quantity: 1, optionsGroup: "cox2_b" },
    ),
  },

  {
    tileName: "Alchemical Hydra",
    side: "A",
    items: opts("hydra_unique", [
      "Brimstone ring piece",
      "Hydra tail",
      "Hydra leather",
      "Hydra claw",
      "Hydra heads",
      "Hydra's jar",
    ]),
  },
  {
    tileName: "Alchemical Hydra",
    side: "B",
    items: opts("hydra_unique", [
      "Brimstone ring piece",
      "Hydra tail",
      "Hydra leather",
      "Hydra claw",
      "Hydra heads",
      "Hydra's jar",
    ]),
  },

  // ── SPECTRAL ─────────────────────────────────────────────────────────────

  {
    tileName: "Barrows",
    side: "A",
    items: opts("barrows_piece", [
      "Ahrim's hood",
      "Ahrim's robetop",
      "Ahrim's robeskirt",
      "Ahrim's staff",
      "Dharok's helm",
      "Dharok's platebody",
      "Dharok's platelegs",
      "Dharok's greataxe",
      "Guthan's helm",
      "Guthan's platebody",
      "Guthan's chainskirt",
      "Guthan's warspear",
      "Karil's coif",
      "Karil's leathertop",
      "Karil's leatherskirt",
      "Karil's crossbow",
      "Torag's helm",
      "Torag's platebody",
      "Torag's platelegs",
      "Torag's hammers",
      "Verac's helm",
      "Verac's brassard",
      "Verac's plateskirt",
      "Verac's flail",
    ]),
  },
  {
    tileName: "Barrows",
    side: "B",
    items: items(
      ...opts("barrows_ahrim", [
        "Ahrim's hood",
        "Ahrim's robetop",
        "Ahrim's robeskirt",
        "Ahrim's staff",
      ]),
      ...opts("barrows_dharok", [
        "Dharok's helm",
        "Dharok's platebody",
        "Dharok's platelegs",
        "Dharok's greataxe",
      ]),
      ...opts("barrows_guthan", [
        "Guthan's helm",
        "Guthan's platebody",
        "Guthan's chainskirt",
        "Guthan's warspear",
      ]),
      ...opts("barrows_karil", [
        "Karil's coif",
        "Karil's leathertop",
        "Karil's leatherskirt",
        "Karil's crossbow",
      ]),
      ...opts("barrows_torag", [
        "Torag's helm",
        "Torag's platebody",
        "Torag's platelegs",
        "Torag's hammers",
      ]),
      ...opts("barrows_verac", [
        "Verac's helm",
        "Verac's brassard",
        "Verac's plateskirt",
        "Verac's flail",
      ]),
    ),
  },

  {
    tileName: "Phantom Muspah",
    side: "A",
    items: items({ itemName: "Venator shard", quantity: 2 }),
  },
  {
    tileName: "Phantom Muspah",
    side: "B",
    items: items({ itemName: "Venator shard", quantity: 3 }),
  },

  {
    tileName: "Amoxliatl",
    side: "A",
    items: items({ itemName: "Pendant of Ates", quantity: 10 }),
  },
  {
    tileName: "Amoxliatl",
    side: "B",
    items: items({ itemName: "Glacial temotli", quantity: 7 }),
  },

  {
    tileName: "Moons of Peril",
    side: "A",
    items: opts("moons_unique", [
      "Eclipse moon helm",
      "Eclipse moon chestplate",
      "Eclipse moon tassets",
      "Eclipse atlatl",
      "Blood moon helm",
      "Blood moon chestplate",
      "Blood moon tassets",
      "Blood moon spear",
      "Lunar helm",
      "Lunar chest",
      "Lunar legs",
      "Atlatl dart",
    ]),
  },
  {
    tileName: "Moons of Peril",
    side: "B",
    items: opts("moons_unique", [
      "Eclipse moon helm",
      "Eclipse moon chestplate",
      "Eclipse moon tassets",
      "Eclipse atlatl",
      "Blood moon helm",
      "Blood moon chestplate",
      "Blood moon tassets",
      "Blood moon spear",
      "Lunar helm",
      "Lunar chest",
      "Lunar legs",
      "Atlatl dart",
    ]),
  },

  { tileName: "Vet'ion", side: "A", items: req("Skull of Vet'ion") },
  {
    tileName: "Vet'ion",
    side: "B",
    items: req("Voidwaker blade", "Ring of the gods"),
  },

  {
    tileName: "Revenants",
    side: "A",
    items: opts("rev_unique", [
      "Amulet of avarice",
      "Craw's bow",
      "Thammaron's sceptre",
      "Viggora's chainmace",
      "Ancient crystal",
      "Ancient statuette",
      "Ancient medallion",
      "Ancient effigy",
      "Ancient relic",
    ]),
  },
  {
    tileName: "Revenants",
    side: "B",
    items: opts("rev_unique", [
      "Amulet of avarice",
      "Craw's bow",
      "Thammaron's sceptre",
      "Viggora's chainmace",
      "Ancient crystal",
      "Ancient statuette",
      "Ancient medallion",
      "Ancient effigy",
      "Ancient relic",
    ]),
  },

  {
    tileName: "Whisperer",
    side: "A",
    items: items({ itemName: "Bellator vestige", quantity: 1 }),
  },
  {
    tileName: "Whisperer",
    side: "B",
    items: items({ itemName: "Bellator vestige", quantity: 2 }),
  },

  // ── ANIMALISTIC ──────────────────────────────────────────────────────────

  {
    tileName: "Gauntlet",
    side: "A",
    items: opts("gauntlet_seed", [
      "Armour seed",
      "Weapon seed",
      "Enhanced weapon seed",
    ]),
  },
  {
    tileName: "Gauntlet",
    side: "B",
    items: opts("gauntlet_seed", [
      "Armour seed",
      "Weapon seed",
      "Enhanced weapon seed",
    ]),
  },

  { tileName: "Callisto", side: "A", items: req("Claw of Callisto") },
  {
    tileName: "Callisto",
    side: "B",
    items: req("Voidwaker hilt", "Tyrannical ring"),
  },

  {
    tileName: "Scurrius",
    side: "A",
    items: items({ itemName: "Scurrius' spine", quantity: 5 }),
  },
  {
    tileName: "Scurrius",
    side: "B",
    items: items({ itemName: "Scurrius' spine", quantity: 5 }),
  },

  {
    tileName: "Pets",
    side: "A",
    items: opts("pet", ["Any valid pet (see exclusion list)"]),
  },
  {
    tileName: "Pets",
    side: "B",
    items: opts("pet", [
      "Any valid pet (see exclusion list) — different team member",
    ]),
  },

  {
    tileName: "Dagannoth Kings",
    side: "A",
    items: opts("dks_ring", [
      "Berserker ring",
      "Archers ring",
      "Seers' ring",
      "Warrior ring",
    ]),
  },
  {
    tileName: "Dagannoth Kings",
    side: "B",
    items: opts("dks_ring", [
      "Berserker ring",
      "Archers ring",
      "Seers' ring",
      "Warrior ring",
    ]),
  },

  {
    tileName: "Corporeal Beast",
    side: "A",
    items: req("Spirit shield", "Holy elixir"),
  },
  {
    tileName: "Corporeal Beast",
    side: "B",
    items: opts("corp_b", [
      "Elysian sigil",
      "Spectral sigil",
      "Arcane sigil",
      "Corporeal beast's jar",
    ]),
  },

  {
    tileName: "Sailing",
    side: "A",
    items: opts("sailing_item", [
      "Broken dragon hook",
      "Dragon cannon barrel",
      "Bottled storm",
    ]),
  },
  {
    tileName: "Sailing",
    side: "B",
    items: req("Broken dragon hook", "Dragon cannon barrel", "Bottled storm"),
  },

  // ── GOD WARS ─────────────────────────────────────────────────────────────

  {
    tileName: "K'ril Tsutsaroth",
    side: "A",
    items: opts("kril_unique", [
      "Steam battlestaff",
      "Zamorakian spear",
      "Staff of the dead",
    ]),
  },
  {
    tileName: "K'ril Tsutsaroth",
    side: "B",
    items: opts("kril_b", [
      "Zamorak hilt",
      "Steam battlestaff",
      "Zamorakian spear",
      "Staff of the dead",
    ]),
  },

  {
    tileName: "Commander Zilyana",
    side: "A",
    items: opts("zilyana_unique", [
      "Saradomin sword",
      "Saradomin's light",
      "Armadyl crossbow",
    ]),
  },
  {
    tileName: "Commander Zilyana",
    side: "B",
    items: opts("zilyana_b", [
      "Saradomin hilt",
      "Saradomin sword",
      "Saradomin's light",
      "Armadyl crossbow",
    ]),
  },

  {
    tileName: "Wintertodt",
    side: "A",
    items: items(
      { itemName: "Burnt pages", quantity: 200 },
      {
        itemName: "Pyromancer piece (counts as 25 pages each)",
        optionsGroup: "wt_equivalent",
      },
      {
        itemName: "Bruma torch (counts as 25 pages)",
        optionsGroup: "wt_equivalent",
      },
      {
        itemName: "Tome of fire duplicate (counts as 25 pages)",
        optionsGroup: "wt_equivalent",
      },
    ),
  },
  { tileName: "Wintertodt", side: "B", items: req("Tome of fire") },

  {
    tileName: "Nex",
    side: "A",
    items: opts("nex_unique", [
      "Zaryte vambraces",
      "Nihil horn",
      "Torva full helm",
      "Torva platebody",
      "Torva platelegs",
      "Ancient hilt",
    ]),
  },
  {
    tileName: "Nex",
    side: "B",
    items: opts("nex_unique", [
      "Zaryte vambraces",
      "Nihil horn",
      "Torva full helm",
      "Torva platebody",
      "Torva platelegs",
      "Ancient hilt",
    ]),
  },

  {
    tileName: "Kree'arra",
    side: "A",
    items: opts("kree_unique", [
      "Armadyl chestplate",
      "Armadyl chainskirt",
      "Armadyl helmet",
    ]),
  },
  {
    tileName: "Kree'arra",
    side: "B",
    items: opts("kree_b", [
      "Armadyl hilt",
      "Armadyl chestplate",
      "Armadyl chainskirt",
      "Armadyl helmet",
    ]),
  },

  {
    tileName: "General Graardor",
    side: "A",
    items: opts("bandos_unique", [
      "Bandos chestplate",
      "Bandos tassets",
      "Bandos boots",
    ]),
  },
  {
    tileName: "General Graardor",
    side: "B",
    items: opts("bandos_b", [
      "Bandos hilt",
      "Bandos chestplate",
      "Bandos tassets",
      "Bandos boots",
    ]),
  },

  {
    tileName: "Tormented Demons",
    side: "A",
    items: opts("td_drop", ["Burning claw", "Synapse"]),
  },
  {
    tileName: "Tormented Demons",
    side: "B",
    items: opts("td_drop", ["Burning claw", "Synapse"]),
  },

  // ── VAMPYRIC ─────────────────────────────────────────────────────────────

  {
    tileName: "Blood Shards",
    side: "A",
    items: items({ itemName: "Blood shard", quantity: 2 }),
  },
  {
    tileName: "Blood Shards",
    side: "B",
    items: items({ itemName: "Blood shard", quantity: 3 }),
  },

  {
    tileName: "TOB 1",
    side: "A",
    items: opts("justiciar", [
      "Justiciar faceguard",
      "Justiciar chestguard",
      "Justiciar legguards",
    ]),
  },
  {
    tileName: "TOB 1",
    side: "B",
    items: opts("justiciar", [
      "Justiciar faceguard",
      "Justiciar chestguard",
      "Justiciar legguards",
    ]),
  },

  {
    tileName: "Araxxor",
    side: "A",
    items: opts("araxxor_unique", [
      "Noxious halberd piece",
      "Araxyte fang",
      "Araxyte head",
      "Jar of venom",
    ]),
  },
  {
    tileName: "Araxxor",
    side: "B",
    items: opts("araxxor_unique", [
      "Noxious halberd piece",
      "Araxyte fang",
      "Araxyte head",
      "Jar of venom",
    ]),
  },

  {
    tileName: "Vardorvis",
    side: "A",
    items: items({ itemName: "Ultor vestige", quantity: 1 }),
  },
  {
    tileName: "Vardorvis",
    side: "B",
    items: items({ itemName: "Ultor vestige", quantity: 2 }),
  },

  { tileName: "TOB 2", side: "A", items: req("Avernic defender hilt") },
  {
    tileName: "TOB 2",
    side: "B",
    items: opts("tob_weapon", [
      "Ghrazi rapier",
      "Sanguinesti staff",
      "Scythe of vitur",
    ]),
  },

  {
    tileName: "Nightmare",
    side: "A",
    items: opts("nightmare_drop", [
      "Nightmare staff",
      "Inquisitor's great helm",
      "Inquisitor's hauberk",
      "Inquisitor's plateskirt",
      "Inquisitor's mace",
      "Eldritch orb",
      "Harmonised orb",
      "Volatile orb",
      "Jar of dreams",
    ]),
  },
  {
    tileName: "Nightmare",
    side: "B",
    items: opts("nightmare_drop", [
      "Nightmare staff",
      "Inquisitor's great helm",
      "Inquisitor's hauberk",
      "Inquisitor's plateskirt",
      "Inquisitor's mace",
      "Eldritch orb",
      "Harmonised orb",
      "Volatile orb",
      "Jar of dreams",
    ]),
  },

  { tileName: "Venenatis", side: "A", items: req("Fang of Venenatis") },
  {
    tileName: "Venenatis",
    side: "B",
    items: req("Fang of Venenatis", "Voidwaker gem", "Treasonous ring"),
  },

  // ── DESERT ───────────────────────────────────────────────────────────────

  {
    tileName: "Colosseum",
    side: "A",
    items: items({ itemName: "Echo crystal", quantity: 2 }),
  },
  {
    tileName: "Colosseum",
    side: "B",
    items: opts("sunfire_piece", [
      "Sunfire fanatic helm",
      "Sunfire fanatic cuirass",
      "Sunfire fanatic chausses",
    ]),
  },

  {
    tileName: "Pyramid Plunder",
    side: "A",
    items: items({ itemName: "Pharaoh's sceptre", quantity: 1 }),
  },
  {
    tileName: "Pyramid Plunder",
    side: "B",
    items: items({ itemName: "Pharaoh's sceptre", quantity: 2 }),
  },

  { tileName: "TOA 1", side: "A", items: req("Lightbearer") },
  {
    tileName: "TOA 1",
    side: "B",
    items: req("Osmumten's fang", "Elidinis' ward"),
  },

  { tileName: "GOTR", side: "A", items: req("Abyssal lantern") },
  {
    tileName: "GOTR",
    side: "B",
    items: items({ itemName: "Abyssal dye", quantity: 2 }),
  },

  {
    tileName: "Leviathan",
    side: "A",
    items: items({ itemName: "Venator vestige", quantity: 1 }),
  },
  {
    tileName: "Leviathan",
    side: "B",
    items: items({ itemName: "Venator vestige", quantity: 2 }),
  },

  {
    tileName: "Tempoross",
    side: "A",
    items: items(
      { itemName: "Soaked pages", quantity: 200 },
      {
        itemName: "Tome of water duplicate (counts as 25 pages)",
        optionsGroup: "tempoross_equivalent",
      },
      {
        itemName: "Big harpoonfish (counts as 25 pages)",
        optionsGroup: "tempoross_equivalent",
      },
    ),
  },
  { tileName: "Tempoross", side: "B", items: req("Tome of water") },

  {
    tileName: "TOA 2",
    side: "A",
    items: opts("masori", ["Masori mask", "Masori body", "Masori chaps"]),
  },
  {
    tileName: "TOA 2",
    side: "B",
    items: opts("masori", ["Masori mask", "Masori body", "Masori chaps"]),
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

  const existing = await db.select().from(tileSideItems).limit(1);
  if (existing.length > 0) {
    console.log("tile_side_items already seeded, skipping.");
    return;
  }

  // Build lookup: tileName → { A: tileSideId, B: tileSideId }
  const allTiles = await db
    .select()
    .from(tiles)
    .where(eq(tiles.bingoEventId, event.id));
  const tileByName = new Map(allTiles.map((t) => [t.name, t]));

  const allSides = await db.select().from(tileSides);
  const sideMap = new Map<string, string>(); // key: `${tileId}:A` / `${tileId}:B`
  for (const s of allSides) sideMap.set(`${s.tileId}:${s.side}`, s.id);

  const rows = DEFS.flatMap(({ tileName, side, items: itemDefs }) => {
    const tile = tileByName.get(tileName);
    if (!tile) throw new Error(`Tile not found: "${tileName}"`);
    const tileSideId = sideMap.get(`${tile.id}:${side}`);
    if (!tileSideId)
      throw new Error(`Tile side not found: "${tileName}" ${side}`);

    return itemDefs.map((d) => ({
      tileSideId,
      itemName: d.itemName,
      quantity: d.quantity ?? 1,
      optionsGroup: d.optionsGroup ?? null,
      sortOrder: d.sortOrder ?? 0,
    }));
  });

  await db.insert(tileSideItems).values(rows);
  console.log(
    `Seeded ${rows.length} tile side items across ${DEFS.length} tile sides.`,
  );
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
