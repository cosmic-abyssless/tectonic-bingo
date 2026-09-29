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
    expect(bundle.players.find((p) => p.discordId === "dev-me")).toEqual({ discordId: "dev-me", rsn: "Dev me", clan: { name: "me" } });
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
