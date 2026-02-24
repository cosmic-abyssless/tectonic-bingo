import { db } from "../index";
import { bingoEvents } from "../schema";

async function seed() {
  const existing = await db.select().from(bingoEvents);
  if (existing.length > 0) {
    console.log("bingo_events already seeded, skipping.");
    return;
  }

  await db.insert(bingoEvents).values({
    name: "Who's That Pokémon!? A Tectonic Bingo",
    startsAt: new Date("2026-02-27T18:00:00Z"),
    endsAt: new Date("2026-03-08T20:00:00Z"),
    potAmount: 900_000_000,
    isActive: false,
  });

  console.log("Seeded bingo_events.");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
