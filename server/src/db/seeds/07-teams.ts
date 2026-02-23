import { db } from '../index';
import { bingoEvents, teams } from '../schema';
import { eq } from 'drizzle-orm';

const TEAMS = [
  { name: "Red Team",    codeword: "REDSTONE",  color: "#ef4444" },
  { name: "Blue Team",   codeword: "COBALT",    color: "#3b82f6" },
  { name: "Green Team",  codeword: "EMERALD",   color: "#22c55e" },
  { name: "Yellow Team", codeword: "SUNSTONE",  color: "#eab308" },
  { name: "Orange Team", codeword: "AMBER",     color: "#f97316" },
  { name: "Pink Team",   codeword: "ROSEWOOD",  color: "#ec4899" },
];

async function seed() {
  const [event] = await db.select().from(bingoEvents).where(eq(bingoEvents.isActive, true)).limit(1);
  const activeEvent = event ?? (await db.select().from(bingoEvents).limit(1))[0];
  if (!activeEvent) {
    console.error('No bingo event found. Run 01-event.ts first.');
    process.exit(1);
  }

  const existing = await db.select().from(teams).where(eq(teams.bingoEventId, activeEvent.id));
  if (existing.length > 0) {
    console.log(`teams already seeded (${existing.length} found), skipping.`);
    return;
  }

  await db.insert(teams).values(
    TEAMS.map(t => ({
      bingoEventId: activeEvent.id,
      name: t.name,
      codeword: t.codeword,
      color: t.color,
    }))
  );

  console.log(`Seeded ${TEAMS.length} teams for event "${activeEvent.name}".`);
}

seed().catch((err) => { console.error(err); process.exit(1); });
