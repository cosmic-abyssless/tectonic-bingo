import { db } from "../index";
import { bingoEvents, tiles, tileWildcards } from "../schema";
import { eq } from "drizzle-orm";

type WildcardDef = {
  tileName: string;
  itemName: string;
  description: string;
  maxRedemptionsPerTeam?: number;
  applicableToSide?: "A" | "B"; // omit = either side
};

const DEFS: WildcardDef[] = [
  // ── DEMONIC ──────────────────────────────────────────────────────────────
  {
    tileName: "Cerberus",
    itemName: "Jar of souls",
    description: "May substitute for any single Cerberus unique.",
  },
  {
    tileName: "Abyssal Sire",
    itemName: "Jar of miasma",
    description:
      "May substitute for one piece of Abyssal bludgeon (spine, limb, or axon).",
    applicableToSide: "B",
  },
  {
    tileName: "Duke Sucellus",
    itemName: "Eye of the duke",
    description: "May substitute for 1 ring roll (Magus vestige).",
  },

  // ── DRACONIC ─────────────────────────────────────────────────────────────
  {
    tileName: "COX 1",
    itemName: "Twisted bow",
    description: "May substitute for any single COX 1 required item.",
  },
  {
    tileName: "COX 1",
    itemName: "Kodai insignia",
    description: "May substitute for any single COX 1 required item.",
  },
  {
    tileName: "COX 1",
    itemName: "Elder maul",
    description: "May substitute for any single COX 1 required item.",
  },
  {
    tileName: "Zulrah",
    itemName: "Tanzanite mutagen",
    description: "May substitute for any single Zulrah unique.",
  },
  {
    tileName: "Zulrah",
    itemName: "Magma mutagen",
    description: "May substitute for any single Zulrah unique.",
  },
  {
    tileName: "Zulrah",
    itemName: "Jar of swamp",
    description: "May substitute for any single Zulrah unique.",
  },

  // ── SPECTRAL ─────────────────────────────────────────────────────────────
  {
    tileName: "Whisperer",
    itemName: "Siren's staff",
    description: "May substitute for 1 ring roll (Bellator vestige).",
  },

  // ── VAMPYRIC ─────────────────────────────────────────────────────────────
  {
    tileName: "TOB 1",
    itemName: "Scythe of vitur",
    description:
      "May substitute for one piece of Justiciar armour. Cannot be used for both TOB 1 and TOB 2 — one Scythe covers one tile only.",
  },
  {
    tileName: "Vardorvis",
    itemName: "Executioner's axe head",
    description: "May substitute for 1 ring roll (Ultor vestige).",
  },

  // ── DESERT ───────────────────────────────────────────────────────────────
  {
    tileName: "Colosseum",
    itemName: "Tonalztics of ralos",
    description:
      "May substitute for any single Colosseum item (Echo crystal or Sunfire piece).",
  },
  {
    tileName: "TOA 1",
    itemName: "Tumeken's shadow",
    description:
      "May substitute for any single TOA 1 item. If two Shadows are obtained, one may be used for TOA 1 and one for TOA 2.",
  },
  {
    tileName: "TOA 2",
    itemName: "Tumeken's shadow",
    description:
      "May substitute for any single TOA 2 item. If two Shadows are obtained, one may be used for TOA 1 and one for TOA 2.",
  },
  {
    tileName: "Leviathan",
    itemName: "Leviathan's lure",
    description: "May substitute for 1 ring roll (Venator vestige).",
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

  const existing = await db.select().from(tileWildcards).limit(1);
  if (existing.length > 0) {
    console.log("tile_wildcards already seeded, skipping.");
    return;
  }

  const allTiles = await db
    .select()
    .from(tiles)
    .where(eq(tiles.bingoEventId, event.id));
  const tileByName = new Map(allTiles.map((t) => [t.name, t]));

  const rows = DEFS.map((d) => {
    const tile = tileByName.get(d.tileName);
    if (!tile) throw new Error(`Tile not found: "${d.tileName}"`);
    return {
      tileId: tile.id,
      itemName: d.itemName,
      description: d.description,
      maxRedemptionsPerTeam: d.maxRedemptionsPerTeam ?? 1,
      applicableToSide: d.applicableToSide ?? null,
    };
  });

  await db.insert(tileWildcards).values(rows);
  console.log(`Seeded ${rows.length} wildcards.`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
