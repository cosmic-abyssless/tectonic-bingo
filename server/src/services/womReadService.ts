// Reads each Player's Wise Old Man snapshots during a Bingo and stores them (#182). Titles take EHB, EHP and clue
// gains from them; luck (#195) takes each boss's kill counts over time from the same rows.
//
// A good API citizen: only what WOM already has is read (never an update request), every page of snapshots is one
// request paced within WOM's limit (20 a minute, 100 with WOM_API_KEY), a 429 holds the queue off, and each read
// starts from the last stored snapshot, so a Player costs about one request an hour however long the Bingo runs.
// Once a Bingo is Finished, one last read runs up to its end, and after that it's never read again.
import { and, eq, inArray, max } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { WomGains } from "@bingo/shared";
import * as schema from "../db/schema";
import { bingos, teamMembers, teams, womReads, womSnapshots } from "../db/schema";
import { log } from "../log";
import { effectiveStartsAt, endedAt } from "./bingoStart";
import { TESTDATA_PREFIX } from "./devTestDataService";
import { rsnsInBingo } from "./playerNames";
import { getWomClient, parseSnapshots, type WomClient, type WomSnapshot } from "./womService";
import * as achievementService from "./achievementService";

type Db = BetterSQLite3Database<typeof schema>;

const HOUR_MS = 60 * 60 * 1000;
/** How far before the Bingo's start a read begins, for a baseline snapshot. Older would count pre-Bingo play as gains. */
export const BASELINE_LOOKBACK_MS = 24 * HOUR_MS;
export const READ_INTERVAL_MS = HOUR_MS;
/** A Bingo Finished longer ago than this isn't given its final read after a restart: it predates the reads, or had it. */
const FINAL_READ_GRACE_MS = 7 * 24 * HOUR_MS;

function readsDisabled(): boolean {
  return process.env.WOM_SNAPSHOT_READS_DISABLED === "true";
}

export interface ReadJob {
  bingoId: string;
  userId: string;
}

export type ReadResult = "read" | "skipped" | "rate_limited" | "failed";

/**
 * Reads one Player's new snapshots, from their last stored one (or shortly before the Bingo's start) up to now, or
 * up to the Bingo's end once it's Finished. Skips a Bingo that isn't running and a Player already read through its end.
 */
export async function readPlayer(db: Db, client: WomClient, job: ReadJob, opts: { now: Date; beforeEachPage?: () => Promise<void> }): Promise<ReadResult> {
  const bingo = db.select().from(bingos).where(eq(bingos.id, job.bingoId)).get();
  if (!bingo || (bingo.stage !== "live" && bingo.stage !== "complete") || bingo.slug.startsWith(TESTDATA_PREFIX)) return "skipped";
  const start = effectiveStartsAt(db, bingo);
  const rsn = rsnsInBingo(db, bingo.id, [job.userId]).get(job.userId);
  if (!start || !rsn) return "skipped";
  const end = endedAt(db, bingo);
  const to = end ?? opts.now;

  const where = and(eq(womReads.bingoId, bingo.id), eq(womReads.userId, job.userId));
  let state = db.select().from(womReads).where(where).get();
  if (state && state.rsn !== rsn) {
    // A different account now: what's stored belongs to the old one.
    db.delete(womSnapshots).where(and(eq(womSnapshots.bingoId, bingo.id), eq(womSnapshots.userId, job.userId))).run();
    db.delete(womReads).where(where).run();
    state = undefined;
  }
  if (end && state?.readThrough && state.readThrough >= end) return "skipped";

  const lastStored = db
    .select({ at: max(womSnapshots.takenAt) })
    .from(womSnapshots)
    .where(and(eq(womSnapshots.bingoId, bingo.id), eq(womSnapshots.userId, job.userId)))
    .get()?.at;
  // From the last stored snapshot itself (it comes back again and is ignored), so nothing between reads is missed.
  const from = lastStored ?? state?.readThrough ?? new Date(start.getTime() - BASELINE_LOOKBACK_MS);
  if (from >= to) return "skipped";

  const raw = await client.getSnapshots(rsn, from, to, { beforeEachPage: opts.beforeEachPage });
  if (!raw) {
    if (client.rateLimitedUntilMs > Date.now()) return "rate_limited";
    const lastError = "Wise Old Man has no snapshots for this RSN, or couldn't be reached";
    if (state) db.update(womReads).set({ lastError, lastErrorAt: opts.now }).where(where).run();
    else db.insert(womReads).values({ bingoId: bingo.id, userId: job.userId, rsn, lastError, lastErrorAt: opts.now }).run();
    return "failed";
  }

  db.transaction((tx) => {
    for (const s of parseSnapshots(raw)) {
      tx.insert(womSnapshots)
        .values({ bingoId: bingo.id, userId: job.userId, takenAt: s.at, ehb: s.ehb, ehp: s.ehp, clues: s.clues, bossKillsJson: JSON.stringify(s.bossKills) })
        .onConflictDoNothing()
        .run();
    }
    const read = { rsn, readAt: opts.now, readThrough: to, lastError: null, lastErrorAt: null };
    if (state) tx.update(womReads).set(read).where(where).run();
    else tx.insert(womReads).values({ bingoId: bingo.id, userId: job.userId, ...read }).run();
  });
  // Achievements (CONTEXT.md): Leech looks at the clue counts just stored. After the commit, and never fails the read.
  achievementService.recordWomSnapshotsRead(db, bingo.id, job.userId);
  return "read";
}

/** Each Player's stored snapshots, oldest first. */
export function loadTimelines(db: Db, bingoId: string): Map<string, WomSnapshot[]> {
  const rows = db.select().from(womSnapshots).where(eq(womSnapshots.bingoId, bingoId)).orderBy(womSnapshots.takenAt).all();
  const out = new Map<string, WomSnapshot[]>();
  for (const r of rows) {
    const list = out.get(r.userId) ?? [];
    list.push({ at: r.takenAt, bossKills: JSON.parse(r.bossKillsJson) as WomSnapshot["bossKills"], ehb: r.ehb, ehp: r.ehp, clues: r.clues });
    out.set(r.userId, list);
  }
  return out;
}

/**
 * What a Player gained from the Bingo's start up to its end (or their latest snapshot): the last snapshot at or before
 * the start, else their first one during the Bingo, to their last one by the end. Never negative. Null with no
 * snapshot by the end.
 */
export function gainsOf(timeline: WomSnapshot[], start: Date, end: Date | null): WomGains | null {
  const upToEnd = end ? timeline.filter((s) => s.at <= end) : timeline;
  const latest = upToEnd.at(-1);
  if (!latest) return null;
  const baseline = upToEnd.filter((s) => s.at <= start).at(-1) ?? upToEnd[0]!;
  const gained = (pick: (s: WomSnapshot) => number | null) => Math.max(0, (pick(latest) ?? 0) - (pick(baseline) ?? 0));
  return { ehb: gained((s) => s.ehb), ehp: gained((s) => s.ehp), clues: gained((s) => s.clues), asOf: latest.at.toISOString() };
}

/** When Wise Old Man was last read for any Player of the Bingo, or null if it hasn't been. */
export function lastReadAt(db: Db, bingoId: string): Date | null {
  return db.select({ at: max(womReads.readAt) }).from(womReads).where(eq(womReads.bingoId, bingoId)).get()?.at ?? null;
}

const keyOf = (job: ReadJob) => `${job.bingoId}:${job.userId}`;

/**
 * Reads Players one at a time, each page of snapshots paced to WOM's limit. A Player already waiting (or being
 * read) isn't added twice. During a 429 hold-off it waits, then retries the same Player.
 */
export class WomReadQueue {
  private pending = new Map<string, ReadJob>();
  private running: string | null = null;
  private nextSlotMs = 0;
  private readonly intervalMs: number;
  private idle: Promise<void> = Promise.resolve();

  constructor(
    private db: Db,
    private client: WomClient = getWomClient(),
    private deps: { now?: () => Date; sleep?: (ms: number) => Promise<void>; perMinute?: number } = {},
  ) {
    this.intervalMs = 60_000 / (deps.perMinute ?? (client.hasApiKey ? 100 : 20));
  }

  /** Queues a read; false when that Player is already queued. */
  add(job: ReadJob): boolean {
    const key = keyOf(job);
    if (this.pending.has(key) || this.running === key) return false;
    this.pending.set(key, job);
    if (this.pending.size === 1 && this.running === null) this.idle = this.drain();
    return true;
  }

  get size(): number {
    return this.pending.size + (this.running ? 1 : 0);
  }

  /** Resolves once everything queued so far has been read. */
  whenIdle(): Promise<void> {
    return this.idle;
  }

  private now = () => this.deps.now?.() ?? new Date();
  private sleep = (ms: number) => (this.deps.sleep ? this.deps.sleep(ms) : new Promise<void>((r) => setTimeout(r, ms)));

  // One request slot: waits until the previous request is a full interval ago.
  private pace = async () => {
    const at = this.now().getTime();
    const wait = Math.max(0, this.nextSlotMs - at);
    this.nextSlotMs = Math.max(at, this.nextSlotMs) + this.intervalMs;
    if (wait > 0) await this.sleep(wait);
  };

  private async drain(): Promise<void> {
    while (this.pending.size > 0) {
      const [key, job] = this.pending.entries().next().value as [string, ReadJob];
      this.pending.delete(key);
      this.running = key;
      try {
        const holdOff = this.client.rateLimitedUntilMs - this.now().getTime();
        if (holdOff > 0) await this.sleep(holdOff);
        const result = await readPlayer(this.db, this.client, job, { now: this.now(), beforeEachPage: this.pace });
        // Back to the front, to retry once the hold-off passes.
        if (result === "rate_limited") this.pending = new Map([[key, job], ...this.pending]);
      } catch (err) {
        log.warn("wom snapshot read failed", { ...job, err });
      } finally {
        this.running = null;
      }
    }
  }
}

/** The Players of a Bingo's Teams. */
function members(db: Db, bingoId: string): string[] {
  const teamIds = db.select({ id: teams.id }).from(teams).where(eq(teams.bingoId, bingoId)).all().map((t) => t.id);
  if (teamIds.length === 0) return [];
  return db.select({ userId: teamMembers.userId }).from(teamMembers).where(inArray(teamMembers.teamId, teamIds)).all().map((m) => m.userId);
}

/** Queues every Player of one Bingo: when it goes Live (for the baseline) and when it's Finished (the final read). */
export function queueBingoReads(db: Db, queue: WomReadQueue, bingoId: string): void {
  if (readsDisabled()) return;
  for (const userId of members(db, bingoId)) queue.add({ bingoId, userId });
}

/**
 * The hourly round: every Player of every Live Bingo, plus any Player of a recently Finished Bingo still missing the
 * final read (after a restart, or a failed read).
 */
export function queueDueReads(db: Db, queue: WomReadQueue, now: Date): void {
  if (readsDisabled()) return;
  for (const bingo of db.select().from(bingos).where(inArray(bingos.stage, ["live", "complete"])).all()) {
    if (bingo.slug.startsWith(TESTDATA_PREFIX)) continue;
    if (bingo.stage === "live") {
      queueBingoReads(db, queue, bingo.id);
      continue;
    }
    const end = endedAt(db, bingo);
    if (!end || now.getTime() - end.getTime() > FINAL_READ_GRACE_MS) continue;
    const readThrough = new Map(
      db.select({ userId: womReads.userId, readThrough: womReads.readThrough }).from(womReads).where(eq(womReads.bingoId, bingo.id)).all().map((r) => [r.userId, r.readThrough]),
    );
    for (const userId of members(db, bingo.id)) {
      const through = readThrough.get(userId);
      if (!through || through < end) queue.add({ bingoId: bingo.id, userId });
    }
  }
}

let _queue: WomReadQueue | undefined;

export function getWomReadQueue(db: Db): WomReadQueue {
  if (!_queue) _queue = new WomReadQueue(db);
  return _queue;
}

/** Starts the hourly round, and runs one now. The timer doesn't keep the process alive. */
export function startWomReads(db: Db): void {
  if (readsDisabled()) return;
  const queue = getWomReadQueue(db);
  const round = () => {
    try {
      queueDueReads(db, queue, new Date());
    } catch (err) {
      log.warn("wom snapshot round failed", { err });
    }
  };
  round();
  setInterval(round, READ_INTERVAL_MS).unref();
}
