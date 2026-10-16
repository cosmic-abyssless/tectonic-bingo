// Reads each Player's Wise Old Man snapshots during a Bingo and stores them (#182). Titles take EHB, EHP and clue
// gains from them; luck (#195) takes each boss's kill counts over time from the same rows.
//
// A good API citizen: only what WOM already has is read, every page of snapshots is one request paced under WOM's
// limit (16 a minute of its 20, 80 of its 100 with WOM_API_KEY), a 429 holds the queue off, and each read starts from
// the last stored snapshot, so a Player costs about one request an hour however long the Bingo runs. The one update
// request per Player, at start + 6h (queueDueWomUpdates), goes through the same queue and pacing.
// Once a Bingo is Finished, one last read runs up to its end, and after that it's never read again, unless a Site admin
// asks for a re-read (rereadBingo), which reads the whole Bingo again to fill in what older reads didn't keep.
// A Player whose latest snapshot was stored before per-boss EHB was kept (Effort) is read from the start once more on
// their next read, Live or within the final read's grace, which fills it in on its own.
import { and, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { WomGains } from "@bingo/shared";
import * as schema from "../db/schema";
import { bingos, teamMembers, teams, womReads, womSnapshots } from "../db/schema";
import { log } from "../log";
import { audit } from "../audit/record";
import { ServiceError } from "./errors";
import { effectiveStartsAt, endedAt } from "./bingoStart";
import { TESTDATA_PREFIX } from "./devTestDataService";
import { rsnsInBingo } from "./playerNames";
import { getWomClient, parseSnapshots, type WomClient, type WomSnapshot } from "./womService";
import * as achievementService from "./achievementService";
import { claimDueWomUpdates } from "./womCompetitionService";

type Db = BetterSQLite3Database<typeof schema>;

const HOUR_MS = 60 * 60 * 1000;
/** How far before the Bingo's start a read begins, for a baseline snapshot. Older would count pre-Bingo play as gains. */
export const BASELINE_LOOKBACK_MS = 24 * HOUR_MS;
export const READ_INTERVAL_MS = HOUR_MS;
/** How often the update at start + 6h is checked for: often enough that it lands well before start + 7h. */
export const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
/** A Bingo Finished longer ago than this isn't given its final read after a restart: it predates the reads, or had it. */
const FINAL_READ_GRACE_MS = 7 * 24 * HOUR_MS;
/**
 * The share of WOM's per-minute limit the reads pace to. Pacing at the limit itself drew 429s in production: network
 * jitter lands two requests closer than the interval, and signups, RSN syncs, admin lookups and competition updates
 * spend the same key's limit unpaced.
 */
const RATE_LIMIT_SHARE = 0.8;

function readsDisabled(): boolean {
  return process.env.WOM_SNAPSHOT_READS_DISABLED === "true";
}

export interface ReadJob {
  bingoId: string;
  userId: string;
  /**
   * "update": ask WOM to update the Player (the update at start + 6h) instead of reading their snapshots. "reread": read
   * a Finished Bingo's whole range again, from before its start to its end, even though it was read through (rereadBingo).
   */
  kind?: "update" | "reread";
}

export type ReadResult = "read" | "updated" | "skipped" | "rate_limited" | "failed";

/**
 * Reads one Player's new snapshots, from their last stored one (or shortly before the Bingo's start) up to now, or
 * up to the Bingo's end once it's Finished. Skips a Bingo that isn't running and a Player already read through its end.
 * A re-read reads a Finished Bingo's whole range again; snapshots already stored keep everything but get the per-boss
 * EHB they were stored without. A Player whose latest stored snapshot lacks it is read from the start the same way.
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
  const reread = job.kind === "reread";
  if (reread && !end) return "skipped";

  const latest = db
    .select({ at: womSnapshots.takenAt, bossEhbJson: womSnapshots.bossEhbJson })
    .from(womSnapshots)
    .where(and(eq(womSnapshots.bingoId, bingo.id), eq(womSnapshots.userId, job.userId)))
    .orderBy(desc(womSnapshots.takenAt))
    .limit(1)
    .get();
  // Stored before per-boss EHB was kept: read from the start again, which fills it in (and then the latest has it).
  const backfill = latest !== undefined && latest.bossEhbJson === null;
  if (!reread && !backfill && end && state?.readThrough && state.readThrough >= end) return "skipped";

  // From the last stored snapshot itself (it comes back again and is ignored), so nothing between reads is missed.
  const from =
    reread || backfill ? new Date(start.getTime() - BASELINE_LOOKBACK_MS) : (latest?.at ?? state?.readThrough ?? new Date(start.getTime() - BASELINE_LOOKBACK_MS));
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
      // A snapshot already stored is left as it is, except that one stored before per-boss EHB was kept gets it now.
      tx.insert(womSnapshots)
        .values({ bingoId: bingo.id, userId: job.userId, takenAt: s.at, ehb: s.ehb, ehp: s.ehp, clues: s.clues, bossKillsJson: JSON.stringify(s.bossKills), bossEhbJson: JSON.stringify(s.bossEhb) })
        .onConflictDoUpdate({
          target: [womSnapshots.bingoId, womSnapshots.userId, womSnapshots.takenAt],
          set: { bossEhbJson: sql`excluded.boss_ehb_json` },
          setWhere: isNull(womSnapshots.bossEhbJson),
        })
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

/**
 * Asks WOM to update one Player of a Live Bingo now (the update at start + 6h): WOM takes a new snapshot of them, which
 * their next read stores. `beforeRequest` is awaited first, for the queue's pacing.
 */
export async function updatePlayer(db: Db, client: WomClient, job: ReadJob, opts: { beforeRequest?: () => Promise<void> } = {}): Promise<ReadResult> {
  const bingo = db.select().from(bingos).where(eq(bingos.id, job.bingoId)).get();
  if (!bingo || bingo.stage !== "live" || bingo.slug.startsWith(TESTDATA_PREFIX)) return "skipped";
  const rsn = rsnsInBingo(db, bingo.id, [job.userId]).get(job.userId);
  if (!rsn) return "skipped";
  await opts.beforeRequest?.();
  const result = await client.updatePlayer(rsn);
  if (result.status === "found") return "updated";
  return client.rateLimitedUntilMs > Date.now() ? "rate_limited" : "failed";
}

/** A stored snapshot. `hasBossEhb` is false on one read before per-boss EHB was kept (its bossEhb is then empty). */
export interface StoredWomSnapshot extends WomSnapshot {
  hasBossEhb: boolean;
}

/** Each Player's stored snapshots, oldest first. */
export function loadTimelines(db: Db, bingoId: string): Map<string, StoredWomSnapshot[]> {
  const rows = db.select().from(womSnapshots).where(eq(womSnapshots.bingoId, bingoId)).orderBy(womSnapshots.takenAt).all();
  const out = new Map<string, StoredWomSnapshot[]>();
  for (const r of rows) {
    const list = out.get(r.userId) ?? [];
    list.push({
      at: r.takenAt,
      bossKills: JSON.parse(r.bossKillsJson) as WomSnapshot["bossKills"],
      bossEhb: r.bossEhbJson === null ? {} : (JSON.parse(r.bossEhbJson) as WomSnapshot["bossEhb"]),
      hasBossEhb: r.bossEhbJson !== null,
      ehb: r.ehb,
      ehp: r.ehp,
      clues: r.clues,
    });
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

/**
 * Boss kills a Player gained over the Bingo, measured like gainsOf (same baseline and latest snapshot), most first.
 * Bosses they didn't gain on are left out.
 */
export function bossGainsOf(timeline: WomSnapshot[], start: Date, end: Date | null): { metric: string; kills: number }[] {
  const upToEnd = end ? timeline.filter((s) => s.at <= end) : timeline;
  const latest = upToEnd.at(-1);
  if (!latest) return [];
  const baseline = upToEnd.filter((s) => s.at <= start).at(-1) ?? upToEnd[0]!;
  return Object.entries(latest.bossKills)
    .map(([metric, kills]) => ({ metric, kills: Math.max(0, (kills ?? 0) - (baseline.bossKills[metric] ?? 0)) }))
    .filter((b) => b.kills > 0)
    .sort((a, b) => b.kills - a.kills || a.metric.localeCompare(b.metric));
}

/** When Wise Old Man was last read for any Player of the Bingo, or null if it hasn't been. */
export function lastReadAt(db: Db, bingoId: string): Date | null {
  return db.select({ at: max(womReads.readAt) }).from(womReads).where(eq(womReads.bingoId, bingoId)).get()?.at ?? null;
}

const keyOf = (job: ReadJob) => `${job.bingoId}:${job.userId}${job.kind ? `:${job.kind}` : ""}`;

/**
 * Reads Players one at a time, each page of snapshots (and each update request) paced to WOM's limit. A Player already
 * waiting (or being read) isn't added twice, nor an update already waiting. During a 429 hold-off it waits, then
 * retries the same job.
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
    this.intervalMs = 60_000 / (deps.perMinute ?? (client.hasApiKey ? 100 : 20) * RATE_LIMIT_SHARE);
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
        const result =
          job.kind === "update"
            ? await updatePlayer(this.db, this.client, job, { beforeRequest: this.pace })
            : await readPlayer(this.db, this.client, job, { now: this.now(), beforeEachPage: this.pace });
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
 * The update at start + 6h: for each Live Bingo it's due for (claimed once, womCompetitionService.claimDueWomUpdates),
 * an update request for every Player of its Teams, recorded in the audit log.
 */
export function queueDueWomUpdates(db: Db, queue: WomReadQueue, now: Date): void {
  for (const bingo of claimDueWomUpdates(db, now)) {
    const userIds = members(db, bingo.id);
    for (const userId of userIds) queue.add({ bingoId: bingo.id, userId, kind: "update" });
    audit(db, {
      action: "wom.participants_updated",
      bingoId: bingo.id,
      entity: { type: "bingo", id: bingo.id, label: bingo.name },
      details: { players: userIds.length },
      actor: "system",
    });
  }
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
    const lacking = lackingBossEhb(db, bingo.id);
    for (const userId of members(db, bingo.id)) {
      const through = readThrough.get(userId);
      if (!through || through < end || lacking.has(userId)) queue.add({ bingoId: bingo.id, userId });
    }
  }
}

/** The Players whose latest stored snapshot was stored before per-boss EHB was kept: their next read fills it in. */
function lackingBossEhb(db: Db, bingoId: string): Set<string> {
  const latest = new Map<string, string | null>();
  const rows = db
    .select({ userId: womSnapshots.userId, bossEhbJson: womSnapshots.bossEhbJson })
    .from(womSnapshots)
    .where(eq(womSnapshots.bingoId, bingoId))
    .orderBy(womSnapshots.takenAt)
    .all();
  for (const r of rows) latest.set(r.userId, r.bossEhbJson);
  return new Set([...latest].filter(([, json]) => json === null).map(([userId]) => userId));
}

/**
 * Re-reads a Finished Bingo from Wise Old Man (a Site admin's button): every Player read before is queued to read the
 * whole Bingo again, from shortly before its start to its end, however long ago it ended, through the queue's pacing.
 * Fills in what older reads didn't keep (per-boss EHB, for Effort) and changes nothing else. Returns how many Players
 * were queued.
 */
export function rereadBingo(db: Db, bingoId: string, queue: WomReadQueue = getWomReadQueue(db)): number {
  const bingo = db.select().from(bingos).where(eq(bingos.id, bingoId)).get();
  if (!bingo) throw new ServiceError(404, "Bingo not found");
  if (bingo.stage !== "complete") throw new ServiceError(400, "Only a Finished Bingo can be re-read from Wise Old Man");
  if (readsDisabled()) throw new ServiceError(409, "Wise Old Man reads are turned off on this server");
  let queued = 0;
  for (const { userId } of db.select({ userId: womReads.userId }).from(womReads).where(eq(womReads.bingoId, bingoId)).all()) {
    if (queue.add({ bingoId, userId, kind: "reread" })) queued++;
  }
  audit(db, { action: "bingo.wom_reread", bingoId, entity: { type: "bingo", id: bingoId, label: bingo.name }, details: { slug: bingo.slug, name: bingo.name, players: queued } });
  return queued;
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
  // The update at start + 6h, checked more often than the reads: the next read of each Player stores its snapshot.
  const updates = () => {
    try {
      queueDueWomUpdates(db, queue, new Date());
    } catch (err) {
      log.warn("wom update round failed", { err });
    }
  };
  updates();
  round();
  setInterval(round, READ_INTERVAL_MS).unref();
  setInterval(updates, UPDATE_CHECK_INTERVAL_MS).unref();
}
