import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { WomClient, type WomSnapshot } from "./womService";
import { gainsOf, queueDueReads, readPlayer, WomReadQueue } from "./womReadService";
import * as achievementService from "./achievementService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

const HOUR = 60 * 60 * 1000;
const START = new Date("2026-01-10T00:00:00Z");
const at = (hours: number) => new Date(START.getTime() + hours * HOUR);

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => sqlite.close());

function seed(opts: { stage?: "live" | "complete"; endedAt?: Date; players?: number } = {}) {
  const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
  const [bingo] = db
    .insert(schema.bingos)
    .values({ slug: "b", name: "B", boardRows: 1, boardCols: 1, stage: opts.stage ?? "live", startsAt: START, createdByUserId: admin!.id })
    .returning()
    .all();
  if (opts.endedAt) db.insert(schema.stageTransitions).values({ bingoId: bingo!.id, fromStage: "live", toStage: "complete", changedByUserId: admin!.id, createdAt: opts.endedAt }).run();
  const [team] = db.insert(schema.teams).values({ bingoId: bingo!.id, captainUserId: admin!.id, name: "T", codeword: "w" }).returning().all();
  const userIds: string[] = [];
  for (let i = 0; i < (opts.players ?? 1); i++) {
    const [u] = db.insert(schema.users).values({ discordId: `p${i}`, discordUsername: `p${i}` }).returning().all();
    db.insert(schema.teamMembers).values({ teamId: team!.id, userId: u!.id }).run();
    db.insert(schema.signups).values({ bingoId: bingo!.id, userId: u!.id, rsn: `Player ${i}` }).run();
    userIds.push(u!.id);
  }
  return { bingoId: bingo!.id, userIds };
}

const raw = (createdAt: Date, ehb: number, clues = 0) => ({
  createdAt: createdAt.toISOString(),
  data: { bosses: { vorkath: { kills: ehb * 10 } }, activities: { clue_scrolls_all: { score: clues } }, computed: { ehb: { value: ehb }, ehp: { value: 0 } } },
});

// A WOM that holds `snapshots` and serves them like the real one: in the date range, newest first, paged.
function fakeWom(snapshots: ReturnType<typeof raw>[], opts: { status?: number } = {}) {
  const fetchImpl = vi.fn(async (input: string | URL, _init?: RequestInit) => {
    if (opts.status) return new Response("", { status: opts.status, headers: { "retry-after": "30" } });
    const url = new URL(String(input));
    const from = new Date(url.searchParams.get("startDate")!).getTime();
    const to = new Date(url.searchParams.get("endDate")!).getTime();
    const limit = Number(url.searchParams.get("limit"));
    const offset = Number(url.searchParams.get("offset"));
    const inRange = snapshots
      .filter((s) => {
        const t = new Date(s.createdAt).getTime();
        return t >= from && t <= to;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return new Response(JSON.stringify(inRange.slice(offset, offset + limit)));
  });
  const urls = () => fetchImpl.mock.calls.map(([input]) => new URL(String(input)));
  return { client: new WomClient(fetchImpl as unknown as typeof fetch, null), fetchImpl, urls };
}

const stored = (bingoId: string) => db.select().from(schema.womSnapshots).where(eq(schema.womSnapshots.bingoId, bingoId)).all();

describe("readPlayer", () => {
  it("reads from shortly before the Bingo's start, then only from the last stored snapshot", async () => {
    const { bingoId, userIds } = seed();
    const wom = fakeWom([raw(at(-30), 1), raw(at(-2), 5), raw(at(3), 8)]);

    expect(await readPlayer(db, wom.client, { bingoId, userId: userIds[0]! }, { now: at(5) })).toBe("read");
    // 24 hours back: the baseline at -2 h, not the one at -30 h.
    expect(wom.urls()[0]!.searchParams.get("startDate")).toBe(at(-24).toISOString());
    expect(stored(bingoId).map((s) => s.takenAt)).toEqual([at(-2), at(3)]);

    await readPlayer(db, wom.client, { bingoId, userId: userIds[0]! }, { now: at(6) });
    expect(wom.urls()[1]!.searchParams.get("startDate")).toBe(at(3).toISOString());
    expect(stored(bingoId)).toHaveLength(2);
  });

  it("never asks Wise Old Man to update a Player", async () => {
    const { bingoId, userIds } = seed();
    const wom = fakeWom([raw(at(1), 1)]);
    await readPlayer(db, wom.client, { bingoId, userId: userIds[0]! }, { now: at(5) });
    for (const [input, init] of wom.fetchImpl.mock.calls) {
      expect(init?.method ?? "GET").toBe("GET");
      expect(String(input)).toMatch(/\/snapshots\?/);
    }
  });

  it("reads a Finished Bingo once, up to its end, and never again", async () => {
    const { bingoId, userIds } = seed({ stage: "complete", endedAt: at(48) });
    const wom = fakeWom([raw(at(1), 1), raw(at(47), 4), raw(at(60), 9)]);

    expect(await readPlayer(db, wom.client, { bingoId, userId: userIds[0]! }, { now: at(100) })).toBe("read");
    expect(wom.urls()[0]!.searchParams.get("endDate")).toBe(at(48).toISOString());
    expect(stored(bingoId).map((s) => s.takenAt)).toEqual([at(1), at(47)]);

    expect(await readPlayer(db, wom.client, { bingoId, userId: userIds[0]! }, { now: at(200) })).toBe("skipped");
    expect(wom.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("records an error when Wise Old Man has nothing for the RSN", async () => {
    const { bingoId, userIds } = seed();
    const wom = fakeWom([], { status: 404 });
    expect(await readPlayer(db, wom.client, { bingoId, userId: userIds[0]! }, { now: at(5) })).toBe("failed");
    expect(db.select().from(schema.womReads).get()?.lastError).toMatch(/no snapshots/);
  });
});

describe("Leech (an Achievement read from the clue counts)", () => {
  const leechEarned = (bingoId: string, userId: string) =>
    db
      .select()
      .from(schema.achievementEarned)
      .all()
      .some((e) => e.bingoId === bingoId && e.userId === userId && e.achievementKey === "leech");
  const switchOn = (bingoId: string, at: Date) => db.transaction((tx) => achievementService.initializeAchievementSettings(tx, bingoId, at));

  it("is earned once a snapshot during the Bingo shows more clues than before it started", async () => {
    const { bingoId, userIds } = seed();
    switchOn(bingoId, START);
    const wom = fakeWom([raw(at(-2), 1, 40), raw(at(3), 1, 40)]);
    await readPlayer(db, wom.client, { bingoId, userId: userIds[0]! }, { now: at(5) });
    expect(leechEarned(bingoId, userIds[0]!)).toBe(false);

    const later = fakeWom([raw(at(3), 1, 40), raw(at(8), 1, 41)]);
    await readPlayer(db, later.client, { bingoId, userId: userIds[0]! }, { now: at(10) });
    expect(leechEarned(bingoId, userIds[0]!)).toBe(true);
  });

  it("doesn't count clues opened before the Bingo started", async () => {
    const { bingoId, userIds } = seed();
    switchOn(bingoId, START);
    const wom = fakeWom([raw(at(-20), 1, 30), raw(at(-2), 1, 40), raw(at(3), 1, 40)]);
    await readPlayer(db, wom.client, { bingoId, userId: userIds[0]! }, { now: at(5) });
    expect(leechEarned(bingoId, userIds[0]!)).toBe(false);
  });

  it("counts reaching the hiscores' minimum at all (stored as no count before) as a clue opened", async () => {
    const { bingoId, userIds } = seed();
    switchOn(bingoId, START);
    const unranked = { ...raw(at(-2), 1), data: { ...raw(at(-2), 1).data, activities: { clue_scrolls_all: { score: -1 } } } };
    const wom = fakeWom([unranked, raw(at(3), 1, 1)]);
    await readPlayer(db, wom.client, { bingoId, userId: userIds[0]! }, { now: at(5) });
    expect(leechEarned(bingoId, userIds[0]!)).toBe(true);
  });

  it("counts a clue from while it was Live on the final read, but not one after the Bingo ended", async () => {
    const during = seed({ stage: "complete", endedAt: at(48) });
    switchOn(during.bingoId, START);
    await readPlayer(db, fakeWom([raw(at(1), 1, 10), raw(at(47), 1, 11)]).client, { bingoId: during.bingoId, userId: during.userIds[0]! }, { now: at(100) });
    expect(leechEarned(during.bingoId, during.userIds[0]!)).toBe(true);
  });

  it("isn't earned from a clue opened after the Bingo ended", async () => {
    const after = seed({ stage: "complete", endedAt: at(48) });
    switchOn(after.bingoId, START);
    await readPlayer(db, fakeWom([raw(at(1), 1, 10), raw(at(60), 1, 11)]).client, { bingoId: after.bingoId, userId: after.userIds[0]! }, { now: at(100) });
    expect(leechEarned(after.bingoId, after.userIds[0]!)).toBe(false);
  });

  it("switched on mid-Bingo, only counts clues from then on", async () => {
    const { bingoId, userIds } = seed();
    switchOn(bingoId, at(10));
    // The clue at 5 h came before Leech was switched on; nothing since.
    await readPlayer(db, fakeWom([raw(at(-2), 1, 40), raw(at(5), 1, 41), raw(at(20), 1, 41)]).client, { bingoId, userId: userIds[0]! }, { now: at(25) });
    expect(leechEarned(bingoId, userIds[0]!)).toBe(false);
  });

  it("isn't earned in a Bingo where it has never been switched on", async () => {
    const { bingoId, userIds } = seed();
    await readPlayer(db, fakeWom([raw(at(-2), 1, 40), raw(at(3), 1, 41)]).client, { bingoId, userId: userIds[0]! }, { now: at(5) });
    expect(leechEarned(bingoId, userIds[0]!)).toBe(false);
  });
});

describe("gainsOf", () => {
  const snap = (hours: number, ehb: number | null, clues: number | null = 0): WomSnapshot => ({ at: at(hours), bossKills: {}, ehb, ehp: 0, clues });

  it("measures from the last snapshot at or before the start", () => {
    expect(gainsOf([snap(-10, 1), snap(-1, 2, 3), snap(5, 7, 10)], START, null)).toEqual({ ehb: 5, ehp: 0, clues: 7, asOf: at(5).toISOString() });
  });

  it("falls back to the first snapshot during the Bingo, so gains are never overstated", () => {
    expect(gainsOf([snap(2, 3), snap(5, 7)], START, null)?.ehb).toBe(4);
  });

  it("stops at the Bingo's end", () => {
    expect(gainsOf([snap(-1, 0), snap(5, 7), snap(50, 20)], START, at(48))).toMatchObject({ ehb: 7, asOf: at(5).toISOString() });
  });

  it("counts a clue count below the hiscores' minimum as 0", () => {
    expect(gainsOf([snap(-1, 0, null), snap(5, 0, 6)], START, null)?.clues).toBe(6);
  });

  it("is null with no snapshot by the end", () => {
    expect(gainsOf([snap(50, 1)], START, at(48))).toBeNull();
  });
});

describe("WomReadQueue", () => {
  // A queue whose clock only moves when it sleeps, recording each wait.
  function pacedQueue(client: WomClient, perMinute: number) {
    let clock = at(5).getTime();
    const waits: number[] = [];
    const queue = new WomReadQueue(db, client, {
      perMinute,
      now: () => new Date(clock),
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
    });
    return { queue, waits };
  }

  it("counts each page as a request and spaces them within the limit", async () => {
    const { bingoId, userIds } = seed({ players: 2 });
    // 150 snapshots: two pages for each Player.
    const wom = fakeWom(Array.from({ length: 150 }, (_, i) => raw(new Date(at(-1).getTime() + i * 60_000), i)));
    const { queue, waits } = pacedQueue(wom.client, 20);
    for (const userId of userIds) queue.add({ bingoId, userId });
    await queue.whenIdle();
    expect(wom.fetchImpl).toHaveBeenCalledTimes(4);
    // The first request goes at once; each after it waits 3 s (20 a minute).
    expect(waits).toEqual([3000, 3000, 3000]);
  });

  it("drops a Player who is already queued", async () => {
    const { bingoId, userIds } = seed();
    const wom = fakeWom([raw(at(1), 1)]);
    const { queue } = pacedQueue(wom.client, 20);
    expect(queue.add({ bingoId, userId: userIds[0]! })).toBe(true);
    expect(queue.add({ bingoId, userId: userIds[0]! })).toBe(false);
    await queue.whenIdle();
    expect(wom.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("holds off after a 429, then retries the same Player", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at(5));
    try {
      const { bingoId, userIds } = seed();
      let limited = true;
      const fetchImpl = vi.fn(async () => {
        if (limited) {
          limited = false;
          return new Response("", { status: 429, headers: { "retry-after": "30" } });
        }
        return new Response(JSON.stringify([raw(at(1), 1)]));
      });
      const client = new WomClient(fetchImpl as unknown as typeof fetch, null);
      const waits: number[] = [];
      const queue = new WomReadQueue(db, client, {
        perMinute: 20,
        sleep: async (ms) => {
          waits.push(ms);
          vi.setSystemTime(Date.now() + ms);
        },
      });
      queue.add({ bingoId, userId: userIds[0]! });
      await queue.whenIdle();
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(waits).toContain(30_000);
      expect(stored(bingoId)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("queueDueReads", () => {
  it("queues every Player of a Live Bingo", () => {
    const { userIds } = seed({ players: 3 });
    const queue = { add: vi.fn(() => true) } as unknown as WomReadQueue;
    queueDueReads(db, queue, at(5));
    expect((queue.add as ReturnType<typeof vi.fn>).mock.calls.map(([job]) => (job as { userId: string }).userId).sort()).toEqual([...userIds].sort());
  });

  it("queues a Finished Bingo's Players only until their final read is done", async () => {
    const { bingoId, userIds } = seed({ stage: "complete", endedAt: at(48), players: 2 });
    await readPlayer(db, fakeWom([raw(at(1), 1)]).client, { bingoId, userId: userIds[0]! }, { now: at(50) });
    const queue = { add: vi.fn(() => true) } as unknown as WomReadQueue;
    queueDueReads(db, queue, at(50));
    expect((queue.add as ReturnType<typeof vi.fn>).mock.calls.map(([job]) => (job as { userId: string }).userId)).toEqual([userIds[1]]);
  });

  it("leaves a Bingo that Finished long ago alone", () => {
    seed({ stage: "complete", endedAt: at(48) });
    const queue = { add: vi.fn(() => true) } as unknown as WomReadQueue;
    queueDueReads(db, queue, at(48 + 24 * 30));
    expect(queue.add).not.toHaveBeenCalled();
  });
});
