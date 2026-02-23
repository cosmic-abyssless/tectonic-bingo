import { db } from '../index';
import { bingoEvents, tiles, bingoLines, bingoLineTiles } from '../schema';
import { eq } from 'drizzle-orm';

async function seed() {
  const [event] = await db.select().from(bingoEvents).limit(1);
  if (!event) { console.error('No bingo event — run 01-event.ts first.'); process.exit(1); }

  const existing = await db.select().from(bingoLines).limit(1);
  if (existing.length > 0) { console.log('bingo_lines already seeded, skipping.'); return; }

  // Build a [row][col] → tileId lookup
  const allTiles = await db.select().from(tiles).where(eq(tiles.bingoEventId, event.id));
  if (allTiles.length !== 49) {
    console.error(`Expected 49 tiles, found ${allTiles.length} — run 02-tiles.ts first.`);
    process.exit(1);
  }

  const grid = new Map<string, string>(); // key: `${row},${col}` → tileId
  for (const t of allTiles) grid.set(`${t.boardRow},${t.boardCol}`, t.id);

  function tileAt(row: number, col: number): string {
    const id = grid.get(`${row},${col}`);
    if (!id) throw new Error(`No tile at [${row},${col}]`);
    return id;
  }

  // Build line definitions: { lineType, lineIndex, tileIds[] }
  type LineDef = { lineType: 'row' | 'column' | 'diagonal'; lineIndex: number; tileIds: string[] };
  const lineDefs: LineDef[] = [];

  // 7 rows (lineIndex 0–6)
  for (let r = 0; r < 7; r++) {
    lineDefs.push({
      lineType: 'row',
      lineIndex: r,
      tileIds: Array.from({ length: 7 }, (_, c) => tileAt(r, c)),
    });
  }

  // 7 columns (lineIndex 0–6)
  for (let c = 0; c < 7; c++) {
    lineDefs.push({
      lineType: 'column',
      lineIndex: c,
      tileIds: Array.from({ length: 7 }, (_, r) => tileAt(r, c)),
    });
  }

  // 2 diagonals
  // lineIndex 0 = top-left → bottom-right (row === col)
  lineDefs.push({
    lineType: 'diagonal',
    lineIndex: 0,
    tileIds: Array.from({ length: 7 }, (_, i) => tileAt(i, i)),
  });
  // lineIndex 1 = top-right → bottom-left (row + col === 6)
  lineDefs.push({
    lineType: 'diagonal',
    lineIndex: 1,
    tileIds: Array.from({ length: 7 }, (_, i) => tileAt(i, 6 - i)),
  });

  // Insert lines
  const insertedLines = await db
    .insert(bingoLines)
    .values(lineDefs.map(({ lineType, lineIndex }) => ({
      bingoEventId: event.id,
      lineType,
      lineIndex,
      points: 15,
    })))
    .returning();

  // Insert tile memberships
  const tileMemberships = insertedLines.flatMap((line, i) =>
    lineDefs[i].tileIds.map(tileId => ({ bingoLineId: line.id, tileId }))
  );

  await db.insert(bingoLineTiles).values(tileMemberships);

  console.log(`Seeded ${insertedLines.length} bingo lines and ${tileMemberships.length} tile memberships.`);
}

seed().catch((err) => { console.error(err); process.exit(1); });
