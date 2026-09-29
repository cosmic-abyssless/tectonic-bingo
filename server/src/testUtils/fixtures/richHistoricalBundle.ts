// A rich (version 2) historical bundle for tests: the sample bundle (sample-historical-bundle.json) plus Tasks on the
// top row's three Tiles, a row Line, Submissions, Signups with two Cut signups, and the Draft.
//
// What each Team should end up with, as the engine scores it:
// - Sea Snakes complete the whole top row: Vorkath 35 (10 + 20 + the Tile's 5), Zulrah 20 (15 + 5, the Tile has no
//   points), Barrows 20 (5 + the Tile's 15), and the row's Line 50: 125.
// - Lava Dragons get Dragonbone necklace before any Vorkath unique, so its 20 is withheld until the unique on
//   2024-03-04; a rejected drop counts for nothing; Zulrah's clan call never happens: 35 + 15 + 20 = 70.
// - Rock Crabs are only given the clan call: 5.
import fs from "fs";
import path from "path";
import type { HistoricalBundle } from "@bingo/shared";

export const SAMPLE_BUNDLE = JSON.parse(fs.readFileSync(path.join(__dirname, "sample-historical-bundle.json"), "utf8")) as HistoricalBundle;

const ID = (n: number) => `1000000000000000${String(n).padStart(2, "0")}`;
const at = (day: number, hour = 12) => `2024-03-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`;

export function richHistoricalBundle(): HistoricalBundle {
  const b = structuredClone(SAMPLE_BUNDLE);
  b.version = 2;
  const tile = (row: number, col: number) => b.tiles.find((t) => t.boardRow === row && t.boardCol === col)!;

  Object.assign(tile(0, 0), {
    freezeMinutes: 60,
    tasks: [
      {
        kind: "ANY", key: "vork-any", label: "Any Vorkath unique", points: 10,
        children: [{ kind: "ITEM", key: "vork-head", item: "Vorkath's head" }, { kind: "ITEM", key: "vork-visage", item: "Draconic visage" }],
      },
      { kind: "ITEM", key: "vork-neck", item: "Dragonbone necklace", label: "Dragonbone necklace", points: 20, withholdUntilPrevious: true },
    ],
  });
  Object.assign(tile(0, 1), {
    points: null,
    tasks: [
      {
        kind: "SUM", key: "zul-sum", quantity: 3, label: "Three fangs", points: 15,
        children: [{ kind: "ITEM", key: "zul-fang", item: "Tanzanite fang" }, { kind: "ITEM", key: "zul-magic", item: "Magic fang" }],
      },
      {
        kind: "MANUAL", key: "zul-call", label: "Clan call", description: "Kill Zulrah on a clan call", points: 5, requiresProof: true, proofNote: "The whole team in one screenshot",
        completions: [{ team: "Sea Snakes", at: at(3) }, { team: "Rock Crabs", at: at(3, 20) }],
      },
    ],
  });
  Object.assign(tile(0, 2), {
    requiresProof: true,
    proofNote: "Your kill count",
    tasks: [{ kind: "ITEM", key: "barrows-hood", item: "Ahrim's hood", label: "Ahrim's hood", points: 5 }],
  });

  b.lines = [{ type: "row", index: 0, points: 50 }];

  const drop = (key: string, team: string, player: number, day: number, status: "approved" | "rejected", claims: { leaf: string; item: string | null; quantity: number }[], screenshot: string | null = `shot-${key}`) =>
    ({ key, team, player: ID(player), submittedAt: at(day, 10), reviewedAt: at(day, 12), status, screenshot, claims });
  b.submissions = [
    drop("sea-1", "Sea Snakes", 13, 2, "approved", [{ leaf: "vork-head", item: "Vorkath's head", quantity: 1 }, { leaf: "vork-neck", item: "Dragonbone necklace", quantity: 1 }]),
    drop("sea-2", "Sea Snakes", 11, 3, "approved", [{ leaf: "zul-fang", item: "Tanzanite fang", quantity: 3 }]),
    drop("sea-3", "Sea Snakes", 12, 4, "approved", [{ leaf: "barrows-hood", item: "Ahrim's hood", quantity: 1 }], null),
    drop("lava-1", "Lava Dragons", 2, 2, "approved", [{ leaf: "vork-neck", item: "Dragonbone necklace", quantity: 1 }]),
    drop("lava-2", "Lava Dragons", 3, 4, "approved", [{ leaf: "vork-visage", item: "Draconic visage", quantity: 1 }]),
    drop("lava-3", "Lava Dragons", 1, 5, "rejected", [{ leaf: "zul-fang", item: "Tanzanite fang", quantity: 3 }]),
    drop("lava-4", "Lava Dragons", 1, 5, "approved", [{ leaf: "zul-fang", item: "Tanzanite fang", quantity: 2 }]),
    drop("lava-5", "Lava Dragons", 2, 6, "approved", [{ leaf: "zul-magic", item: "Magic fang", quantity: 1 }]),
    drop("lava-6", "Lava Dragons", 3, 7, "approved", [{ leaf: "barrows-hood", item: "Ahrim's hood", quantity: 1 }]),
    {
      key: "lava-proof", kind: "proof", team: "Lava Dragons", player: ID(3), submittedAt: at(7, 10), reviewedAt: at(7, 12), status: "approved", screenshot: "shot-lava-proof",
      proof: { boardRow: 0, boardCol: 2, task: null },
    },
    {
      key: "sea-proof", kind: "proof", team: "Sea Snakes", player: ID(11), submittedAt: at(3, 10), reviewedAt: at(3, 12), status: "approved", screenshot: "shot-sea-proof",
      proof: { boardRow: 0, boardCol: 1, task: "zul-call" },
    },
  ];

  b.signups = {
    questions: [
      { key: "hours", prompt: "How many hours a day can you play?", type: "text" },
      { key: "notes", prompt: "Anything else?", type: "textarea" },
    ],
    entries: [
      ...b.players.map((p, i) => ({
        discordId: p.discordId, signedUpAt: `2024-02-${String(20 + (i % 5)).padStart(2, "0")}T09:00:00.000Z`, timezone: i % 2 === 0 ? "Europe/London" : null,
        answers: { hours: String(2 + (i % 4)), ...(i === 0 ? { notes: "Happy to captain" } : {}) }, cut: false,
      })),
      { discordId: ID(31), signedUpAt: "2024-02-25T09:00:00.000Z", timezone: "America/New_York", answers: { hours: "1" }, cut: true, rsn: "Driftwood", clan: null },
      { discordId: ID(32), signedUpAt: "2024-02-26T09:00:00.000Z", timezone: null, answers: { hours: "" }, cut: true, rsn: "Sandy", clan: { name: "Sandy B" } },
    ],
  };

  // Captains and co-captains lead before the Draft; the rest are picked, snaking Sea Snakes, Lava Dragons, Rock Crabs.
  b.draft = {
    at: "2024-02-28T20:00:00.000Z",
    order: ["Sea Snakes", "Lava Dragons", "Rock Crabs"],
    picks: [
      { pick: 1, team: "Sea Snakes", player: ID(13) },
      { pick: 2, team: "Lava Dragons", player: ID(2) },
      { pick: 3, team: "Rock Crabs", player: ID(22) },
      { pick: 4, team: "Rock Crabs", player: ID(23) },
      { pick: 5, team: "Lava Dragons", player: ID(3) },
    ],
  };
  return b;
}
