// `--stage historical` (historical.ts): the bundle a run makes, and that the real importer takes it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateHistoricalBundle, type BingoExportDocument } from "@bingo/shared";
import * as schema from "../../db/schema";
import { createTestDb } from "../../testUtils/testDb";
import { importHistoricalBundle } from "../../services/historicalImportService";
import { buildHistoricalBundle } from "./historical";
import { normalizeOptions } from "./options";
import type { Player } from "./people";
import { Rng } from "./rng";

vi.mock("../../ws", () => ({ broadcast: vi.fn() }));

const now = new Date("2026-09-19T12:00:00Z");

// A 3x3 board with one cell left empty and no pictures: a run fills both in.
const task = (localId: number, label: string, points: number) => ({
  localId, kind: "ITEM", label, description: null, notes: null, points, minCount: null, quantity: null, itemName: label, pointsGateLocalId: null, submitGateLocalId: null, allowsPreLoad: false, children: [],
});
const document = {
  bingo: { name: "Board", boardRows: 3, boardCols: 3, rulesMarkdown: "## Rules" },
  tiles: Array.from({ length: 8 }, (_, i) => ({
    name: `Tile ${i}`, boardRow: Math.floor(i / 3), boardCol: i % 3, categoryLocalId: null, hasFreezePeriod: false, freezeDurationMinutes: 0, notes: null, bonusPoints: 5,
    tasks: [task(i * 2 + 1, `Drop ${i}a`, 10), task(i * 2 + 2, `Drop ${i}b`, 15)],
  })),
} as unknown as BingoExportDocument;

afterEach(() => {
  vi.unstubAllEnvs();
});

const me: Player = {
  index: 0, discordId: "dev-me", name: "Dev me", discordName: "me", userId: "u-me", skill: 0.6, activity: 3, offset: -5,
  isMe: true, isMod: false, reviewWindows: [], partnerIndex: null, signupAt: null,
};

function bundleFor(seed: number, withMe = false) {
  const options = normalizeOptions({ stage: "historical", slug: "testdata-hist", seed, teams: 4, teamSize: 5 });
  return buildHistoricalBundle({ options, document, rng: new Rng(seed), me: withMe ? me : null, now });
}

describe("a generated historical bundle", () => {
  it("takes the stage", () => {
    expect(normalizeOptions({ stage: "historical" }).stage).toBe("historical");
  });

  it("passes the bundle checks, with the board's Tiles and made-up people", async () => {
    const bundle = await bundleFor(7);
    expect(validateHistoricalBundle(bundle, { devDiscordIds: true }).problems).toEqual([]);
    expect(bundle.tiles).toHaveLength(document.bingo.boardRows * document.bingo.boardCols);
    expect(bundle.tiles.map((t) => t.name)).toEqual(expect.arrayContaining([...document.tiles.map((t) => t.name), "Tile r3c3"]));
    expect(bundle.tiles[0]).toMatchObject({ name: "Tile 0", points: 30, rules: "- Drop 0a\n- Drop 0b", image: "r1c1.png" });
    expect(bundle.teams).toHaveLength(4);
    expect(bundle.players).toHaveLength(20);
    expect(bundle.players.every((p) => p.discordId.startsWith("testdata-hist-"))).toBe(true);
    expect(new Date(bundle.bingo.endsAt).getTime()).toBeLessThan(now.getTime());
    expect(bundle.unknownPlayers.length).toBeGreaterThan(0);
  });

  it("is the same for a seed", async () => {
    expect(JSON.stringify(await bundleFor(11))).toBe(JSON.stringify(await bundleFor(11)));
  });

  it("puts the dev account on the first Team, in the clan", async () => {
    const bundle = await bundleFor(3, true);
    expect(bundle.teams[0]!.players).toContain("dev-me");
    expect(bundle.players.find((p) => p.discordId === "dev-me")).toEqual({ discordId: "dev-me", rsn: "Dev me", clan: { name: "me" }, womId: expect.any(Number) });
  });

  it("gives every Player their Wise Old Man account, one of them renamed since, which only its id connects", async () => {
    const bundle = await bundleFor(5);
    const participations = (bundle.wom!.data as { participations: { player: { id: number; displayName: string } }[] }).participations;
    expect(bundle.players.every((p) => typeof p.womId === "number")).toBe(true);
    const renamed = participations.filter((w) => !bundle.players.some((p) => p.rsn === w.player.displayName) && !bundle.unknownPlayers.includes(w.player.displayName));
    expect(renamed).toHaveLength(1);
    expect(bundle.players.some((p) => p.womId === renamed[0]!.player.id)).toBe(true);
  });

  it("imports as a Historical Bingo on a dev server, and is refused elsewhere", async () => {
    const { db, sqlite } = createTestDb();
    const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "generated-historical-"));
    try {
      const admin = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().get();
      const bundle = await bundleFor(5);
      await expect(importHistoricalBundle(db, bundle, { createdByUserId: admin.id, uploadsDir })).rejects.toThrow(/discordId must be a Discord user id/);
      vi.stubEnv("DEV_LOGIN_ENABLED", "true");
      vi.stubEnv("NODE_ENV", "development");
      const { bingo } = await importHistoricalBundle(db, bundle, { createdByUserId: admin.id, uploadsDir });
      expect(bingo).toMatchObject({ slug: "testdata-hist", historical: true, stage: "complete" });
    } finally {
      sqlite.close();
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  });
});

// `--stage historical-rich` (historicalRich.ts): a board with every kind of requirement, a withheld Task, Proof
// screenshots and Lines.
const node = (localId: number, kind: string, extra: Record<string, unknown> = {}) => ({ ...task(localId, `Node ${localId}`, 0), kind, itemName: null, ...extra });
const richDocument = {
  ...document,
  tiles: document.tiles.map((t, i) =>
    i === 0
      ? {
          ...t, requiresProof: true, proofNote: "Kill count", hasFreezePeriod: true, freezeDurationMinutes: 30,
          tasks: [
            node(101, "ANY", { label: "Any unique", points: 10, children: [task(102, "Head", 0), task(103, "Visage", 0)] }),
            { ...task(104, "Necklace", 20), pointsGateLocalId: 101 },
          ],
        }
      : i === 1
        ? {
            ...t,
            tasks: [
              node(111, "SUM", { label: "Five fangs", points: 15, quantity: 5, children: [task(112, "Tanzanite fang", 0), { ...task(113, "Magic fang", 0), valuedAs: { itemName: "Magus vestige", divisor: 3, source: "Duke Sucellus" } }] }),
              node(114, "COUNT", { label: "Two of three", points: 10, minCount: 2, children: [task(115, "Ahrim's hood", 0), task(116, "Dharok's axe", 0), node(117, "MANUAL", { label: "A clue" })] }),
              node(118, "MANUAL", { label: "Clan call", points: 5, requiresProof: true, proofNote: "Everyone in shot" }),
            ],
          }
        : t,
  ),
  lines: [{ lineType: "row", lineIndex: 0, points: 50 }, { lineType: "diagonal", lineIndex: 0, points: 40 }],
} as unknown as BingoExportDocument;

function richBundleFor(seed: number, withMe = false) {
  const options = normalizeOptions({ stage: "historical-rich", slug: "testdata-rich", seed, teams: 4, teamSize: 5 });
  return buildHistoricalBundle({ options, document: richDocument, rng: new Rng(seed), me: withMe ? me : null, now });
}

describe("a generated rich historical bundle", () => {
  it("passes the bundle checks for any seed", async () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(validateHistoricalBundle(await richBundleFor(seed, seed % 2 === 0), { devDiscordIds: true }).problems).toEqual([]);
    }
  });

  it("has the board's Tasks, Lines, Signups with Cut signups, a Draft and Submissions", async () => {
    const bundle = await richBundleFor(9);
    expect(bundle.version).toBe(2);
    const first = bundle.tiles.find((t) => t.boardRow === 0 && t.boardCol === 0)!;
    expect(first).toMatchObject({ points: 5, freezeMinutes: 30, requiresProof: true, proofNote: "Kill count" });
    expect(first.tasks!.map((t) => [t.kind, t.label, t.points, t.withholdUntilPrevious])).toEqual([["ANY", "Any unique", 10, false], ["ITEM", "Necklace", 20, true]]);
    expect(bundle.tiles.find((t) => t.boardRow === 0 && t.boardCol === 1)!.tasks!.map((t) => t.kind)).toEqual(["SUM", "COUNT", "MANUAL"]);
    // The board's Valued as comes along.
    expect((bundle.tiles.find((t) => t.boardRow === 0 && t.boardCol === 1)!.tasks![0] as { children: unknown[] }).children).toContainEqual(expect.objectContaining({ item: "Magic fang", valuedAs: { itemName: "Magus vestige", divisor: 3, source: "Duke Sucellus" } }));
    // An item of the first Task also counts toward the second, as an old site's drop could.
    expect((bundle.tiles.find((t) => t.boardRow === 0 && t.boardCol === 1)!.tasks![1] as { children: unknown[] }).children).toContainEqual({ kind: "ITEM", key: "n112", reuse: true });
    expect(bundle.lines).toEqual([{ type: "row", index: 0, points: 50 }, { type: "diagonal", index: 0, points: 40 }]);
    expect(bundle.signups!.entries.filter((e) => e.cut)).toHaveLength(2);
    expect(bundle.draft!.picks.length).toBe(bundle.players.length - bundle.teams.reduce((n, t) => n + 1 + (t.coCaptain ? 1 : 0), 0));
    const statuses = new Set(bundle.submissions!.map((s) => `${s.kind ?? "drop"} ${s.status}`));
    expect([...statuses].sort()).toEqual(["drop approved", "drop rejected", "proof approved"]);
    // Drop values as they were then on some drops; the rest are left to today's prices.
    const drops = bundle.submissions!.flatMap((s) => s.claims ?? []).filter((c) => c.item);
    expect(drops.some((c) => typeof c.value === "number" && c.value > 0)).toBe(true);
    expect(drops.some((c) => c.value === undefined)).toBe(true);
  });

  it("gives one Item of a SUM a Counts as when the board has none, and otherwise carries the board's", async () => {
    const sumOf = (bundle: Awaited<ReturnType<typeof richBundleFor>>) =>
      (bundle.tiles.find((t) => t.boardRow === 0 && t.boardCol === 1)!.tasks![0] as { children: { item?: string; countsAs?: number }[] }).children.map((c) => [c.item, c.countsAs]);
    expect(sumOf(await richBundleFor(9))).toEqual([["Tanzanite fang", undefined], ["Magic fang", 2]]);

    const weighted = structuredClone(richDocument);
    (weighted.tiles[1]!.tasks[0]!.children[0] as { countsAs?: number }).countsAs = 3;
    const options = normalizeOptions({ stage: "historical-rich", slug: "testdata-rich", seed: 9, teams: 4, teamSize: 5 });
    const bundle = await buildHistoricalBundle({ options, document: weighted, rng: new Rng(9), me: null, now });
    expect(sumOf(bundle)).toEqual([["Tanzanite fang", 3], ["Magic fang", undefined]]);
    expect(validateHistoricalBundle(bundle, { devDiscordIds: true }).problems).toEqual([]);
  });

  it("makes the same people as a sparse one, and is the same for a seed", async () => {
    const sparse = await bundleFor(11);
    const rich = await richBundleFor(11);
    expect(rich.players.map((p) => p.rsn)).toEqual(sparse.players.map((p) => p.rsn.replace("testdata-hist", "testdata-rich")));
    expect(JSON.stringify(await richBundleFor(11))).toBe(JSON.stringify(rich));
  });

  it("imports, and the engine scores it", async () => {
    const { db, sqlite } = createTestDb();
    const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "generated-historical-"));
    try {
      vi.stubEnv("DEV_LOGIN_ENABLED", "true");
      vi.stubEnv("NODE_ENV", "development");
      const admin = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().get();
      const { scoring } = await importHistoricalBundle(db, await richBundleFor(5, true), { createdByUserId: admin.id, uploadsDir });
      expect(scoring!.teams).toHaveLength(4);
      expect(scoring!.teams.some((t) => t.total > 0)).toBe(true);
      for (const t of scoring!.teams) expect(t.perDay.reduce((n, d) => n + d.points, 0)).toBe(t.total);
    } finally {
      sqlite.close();
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  });
});
