// Playing the live bingo forward through the real endpoints.
//
// One queue of timed events, processed in date order so the audit log ends up in the order it would really
// have been written: an hourly "tick" in which every team's players put effort into parts and a submission is
// posted whenever a part's next chunk of effort is done; mod review sessions that clear whatever is pending in
// a batch (submissions pile up while the mods sleep); and the follow-ups of those (re-submissions after a
// rejection, an undo, a point adjustment, a hand coming down). See docs/generate-bingo-plan.md, Phase 4.
import type { TeamProgressSummary } from "@bingo/shared";
import { ApiError } from "./client";
import { planSubmissions, type BoardInfo, type Claim, type PartModel } from "./board";
import { localHour, playingProbability, type Player } from "./people";
import { clamp, type Rng } from "./rng";
import { DAY, HOUR, MINUTE, fmt } from "./timeline";
import { setStage, type Ctx } from "./setup";

interface PartState {
  part: PartModel;
  plan: Claim[][];
  costs: number[];
  /** The next submission in `plan` to post. */
  cursor: number;
  /** Effort put in that hasn't yet paid for a submission. */
  effort: number;
  /** Submissions posted and waiting for a review. */
  outstanding: number;
  /** Rejected, waiting for the player to re-submit. */
  resubmitting: number;
  replans: number;
  /** Times the plan was redrawn because its next claim was an item the team already used elsewhere. */
  conflictReplans: number;
  stuck: boolean;
}

export interface SimTeam {
  id: string;
  name: string;
  members: Player[];
  /** How much this team fancies each tile (0.6 - 1.6): different teams push different ones. */
  pref: Map<string, number>;
  /** The share of the board this team is aiming to have done by the end. */
  target: number;
  /** Scales every part's effort so the team's play adds up to about its target. */
  costMult: number;
  /** The nodes the server says the team has completed. */
  completed: Set<string>;
  dirty: boolean;
  /** The item nodes of the team's live (pending or approved) submissions, by submission: what exclusive-item rules lock. */
  live: Map<string, string[]>;
  parts: Map<string, PartState>;
}

interface Submission {
  id: string;
  team: SimTeam;
  state: PartState;
  claims: Claim[];
  by: Player;
  at: Date;
  status: "pending" | "approved" | "rejected";
  reviewScheduled: boolean;
  rejectFirst: boolean;
}

interface QueuedEvent {
  at: Date;
  seq: number;
  run: () => Promise<void>;
}

export interface SimSummary {
  submitted: number;
  approved: number;
  rejected: number;
  pendingAtEnd: number;
  errors: Map<string, number>;
  teams: { name: string; members: number; partsDone: number; partsTotal: number; target: number; points: number; pending: number }[];
  earliest: Date | null;
  latest: Date | null;
}

/** How front-loaded the pace is: 1 would be a straight line, lower means the board fills faster early on. */
export const PACE_EXPONENT = 1;

const REJECTION_NOTES_LATE = ["Wrong item", "Can't see the drop", "Duplicate of an earlier submission"];
const CODEWORD_NOTE = "Codeword not visible in the screenshot, please re-submit with it showing";

export class Simulation {
  private readonly queue: QueuedEvent[] = [];
  private seq = 0;
  private readonly pending: Submission[] = [];
  private readonly rejectedOnce = new Set<number>();
  private undoDone = false;
  private readonly summary: SimSummary = { submitted: 0, approved: 0, rejected: 0, pendingAtEnd: 0, errors: new Map(), teams: [], earliest: null, latest: null };
  private readonly rng: Rng;
  /** Its own stream, so choosing who posts a drop never shifts anything else in a seeded run. */
  private readonly postRng: Rng;
  private readonly reachable: PartModel[];

  constructor(
    private readonly ctx: Ctx,
    private readonly board: BoardInfo,
    readonly teams: SimTeam[],
    private readonly mods: Player[],
  ) {
    this.rng = ctx.rng.fork("simulate");
    this.postRng = ctx.rng.fork("posted-for");
    this.reachable = board.parts.filter((p) => !board.deadlocked.has(p.id));
  }

  /** Puts a follow-up on the queue (used by generate.ts for things it schedules itself). */
  at(when: Date, run: () => Promise<void>): void {
    const item: QueuedEvent = { at: when, seq: this.seq++, run };
    let lo = 0;
    let hi = this.queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const m = this.queue[mid]!;
      if (m.at.getTime() < when.getTime() || (m.at.getTime() === when.getTime() && m.seq < item.seq)) lo = mid + 1;
      else hi = mid;
    }
    this.queue.splice(lo, 0, item);
  }

  // -------------------------------------------------------------------------
  // The run
  // -------------------------------------------------------------------------

  async run(): Promise<SimSummary> {
    const { tl } = this.ctx;
    const playUntil = tl.stage === "complete" ? tl.endsAt : this.ctx.limit;
    const first = tl.startsAt;
    this.at(first, () => this.tick(first, playUntil));

    if (this.rng.chance(0.5) && this.mods.length > 0) {
      const when = new Date(first.getTime() + this.rng.between(0.2, 0.9) * (playUntil.getTime() - first.getTime()));
      this.at(when, () => this.adjustPoints(when));
    }
    if (tl.stage === "complete") {
      for (const [i, mod] of this.mods.slice(0, 2).entries()) {
        const when = new Date(tl.endsAt.getTime() + (5 + i * 20) * MINUTE);
        this.at(when, () => this.reviewBatch(mod, when));
      }
      this.at(tl.completeAt, () => setStage(this.ctx, "complete", tl.completeAt));
    }

    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      if (next.at.getTime() > this.ctx.limit.getTime()) break;
      await next.run();
    }
    await this.refreshAll();
    return this.finish();
  }

  private stamp(at: Date): void {
    const s = this.summary;
    if (!s.earliest || at < s.earliest) s.earliest = at;
    if (!s.latest || at > s.latest) s.latest = at;
  }

  private note(err: unknown, context: string): void {
    const message = err instanceof ApiError ? `${context}: ${err.detail}` : `${context}: ${err instanceof Error ? err.message : String(err)}`;
    this.summary.errors.set(message, (this.summary.errors.get(message) ?? 0) + 1);
  }

  // -------------------------------------------------------------------------
  // Each hour: play
  // -------------------------------------------------------------------------

  private async tick(at: Date, playUntil: Date): Promise<void> {
    await this.refreshDirty();
    const next = new Date(at.getTime() + HOUR);
    if (next.getTime() < playUntil.getTime()) this.at(next, () => this.tick(next, playUntil));

    for (const team of this.teams) this.play(team, at);

    for (const mod of this.mods) {
      const hour = Math.floor(localHour(at, mod.offset));
      if (mod.reviewWindows.includes(hour) && this.rng.chance(0.8)) {
        const when = new Date(at.getTime() + this.rng.int(0, 59) * MINUTE);
        this.at(when, () => this.reviewBatch(mod, when));
      }
    }
  }

  private doneShare(team: SimTeam): number {
    return this.reachable.filter((p) => team.completed.has(p.id)).length / Math.max(1, this.reachable.length);
  }

  /** Parts done or with everything already posted: how far along the team is, counting what is waiting for a review. */
  private progressShare(team: SimTeam): number {
    const along = this.reachable.filter((p) => team.completed.has(p.id) || (team.parts.get(p.id)?.cursor ?? 0) >= (team.parts.get(p.id)?.plan.length ?? Infinity)).length;
    return along / Math.max(1, this.reachable.length);
  }

  private play(team: SimTeam, at: Date): void {
    // Pacing: rare drops set the pace of a bingo, not how keen people are, so a team can't run far ahead of the
    // schedule its target implies (slightly front-loaded: the easy tiles do go first).
    const { tl } = this.ctx;
    const elapsed = clamp((at.getTime() - tl.startsAt.getTime()) / (tl.endsAt.getTime() - tl.startsAt.getTime()), 0.02, 1);
    if (this.progressShare(team) >= team.target * Math.pow(elapsed, PACE_EXPONENT)) return;
    const scores = this.scoreParts(team, at);
    if (scores.length === 0) return;

    for (const member of team.members) {
      if (!this.rng.chance(playingProbability(member, at))) continue;
      const options = scores.filter(([state]) => this.ctx.capable(member, state.part)).map(([state, score]) => [state, score * score] as const);
      if (options.length === 0) continue;
      const state = this.rng.weighted(options);
      state.effort += member.skill * this.rng.between(0.7, 1.3);
      while (state.cursor < state.plan.length && state.effort >= state.costs[state.cursor]!) {
        const claims = state.plan[state.cursor]!;
        state.effort -= state.costs[state.cursor]!;
        state.cursor++;
        const when = new Date(at.getTime() + this.rng.int(0, 3599) * 1000);
        this.at(when, () => this.submit(team, state, claims, member, when, false));
      }
    }
  }

  /** How attractive each part is to this team right now; parts that can't be worked on are left out. */
  private scoreParts(team: SimTeam, at: Date): [PartState, number][] {
    const { board, ctx } = this;
    const out: [PartState, number][] = [];
    for (const state of team.parts.values()) {
      const { part } = state;
      if (team.completed.has(part.id) || state.stuck || state.cursor >= state.plan.length) continue;
      const tile = board.tileById.get(part.tileId)!;
      if (tile.freezeMs > 0 && at.getTime() < ctx.tl.startsAt.getTime() + tile.freezeMs) continue;
      if (!state.plan[state.cursor]!.every((c) => board.claimable(c.nodeId, team.completed))) continue;
      // An item the team already used elsewhere can't be claimed here: draw the part's plan again (other pets, other
      // items) a few times, and leave the part alone if it keeps landing on locked ones.
      if (this.conflicts(team, state.plan[state.cursor]!)) {
        if (state.conflictReplans >= 5) continue;
        state.conflictReplans++;
        this.replan(team, state);
        state.replans--;
        continue;
      }

      let score = 1;
      const siblingsDone = tile.parts.filter((p) => p !== part).every((p) => team.completed.has(p.id));
      const firstDone = part.index > 0 && team.completed.has(tile.parts[0]!.id);
      if (firstDone) score += 3; // a page is done: go for the tile bonus
      else if (part.index > 0 && (team.parts.get(tile.parts[0]!.id)?.outstanding ?? 0) > 0) score += 1.5;
      const weight = siblingsDone ? 1 : 0.3; // the line bonus only lands when this part finishes the tile
      for (const line of board.lines) {
        if (!line.tileIds.includes(tile.id)) continue;
        const missing = line.tileIds.filter((id) => id !== tile.id && !team.completed.has(board.tileById.get(id)!.nodeId)).length;
        if (missing === 0) score += 2 * weight;
        else if (missing === 1) score += 0.7 * weight;
      }
      score += 2 * clamp(state.effort / Math.max(0.01, state.costs.reduce((a, b) => a + b, 0)), 0, 1); // keep going with what's started
      out.push([state, score * (team.pref.get(tile.id) ?? 1)]);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Submitting and reviewing
  // -------------------------------------------------------------------------

  private async submit(team: SimTeam, state: PartState, claims: Claim[], by: Player, at: Date, again: boolean): Promise<void> {
    if (again) state.resubmitting = Math.max(0, state.resubmitting - 1);
    if (!claims.every((c) => this.board.claimable(c.nodeId, team.completed))) {
      this.note(new Error("a claim was gated at post time"), "skipped");
      return;
    }
    if (this.conflicts(team, claims)) {
      this.note(new Error("an item was used elsewhere in the meantime"), "skipped");
      return;
    }
    // About one drop in eight is posted by a teammate: the player got it on mobile and someone at a PC sent it in.
    // `by` stays the player the drop belongs to; the poster is the session that uploads it.
    const others = team.members.filter((m) => m !== by && m.userId);
    const poster = by.userId && others.length > 0 && this.postRng.chance(0.12) ? this.postRng.pick(others) : null;
    try {
      const { submission } = await this.ctx.api
        .as((poster ?? by).discordId)
        .submit<{ submission: { id: string } }>(`/api/bingos/${this.ctx.slug}/submissions`, claims, { at }, poster ? by.userId! : undefined);
      this.stamp(at);
      const first = !this.rejectedOnce.has(by.index) && at.getTime() < this.ctx.tl.startsAt.getTime() + DAY && this.rng.chance(0.2);
      if (first) this.rejectedOnce.add(by.index);
      const rec: Submission = { id: submission.id, team, state, claims, by, at, status: "pending", reviewScheduled: false, rejectFirst: first };
      this.pending.push(rec);
      team.live.set(rec.id, claims.map((c) => c.nodeId));
      state.outstanding++;
      this.summary.submitted++;
    } catch (err) {
      this.note(err, `submit ${state.part.tileName} ${state.part.label}`);
    }
  }

  private async reviewBatch(mod: Player, at: Date): Promise<void> {
    const due = this.pending.filter((s) => s.status === "pending" && !s.reviewScheduled && s.at.getTime() < at.getTime());
    let t = at;
    for (const sub of due) {
      t = new Date(t.getTime() + this.rng.int(20, 90) * 1000);
      sub.reviewScheduled = true;
      const when = t;
      this.at(when, () => this.review(mod, sub, when));
    }
  }

  private async review(mod: Player, sub: Submission, at: Date): Promise<void> {
    const day = at.getTime() - this.ctx.tl.startsAt.getTime() < DAY;
    let action: "approve" | "reject" = "approve";
    let reviewerNotes: string | undefined;
    if (sub.rejectFirst) {
      action = "reject";
      reviewerNotes = CODEWORD_NOTE;
    } else if (!day && this.rng.chance(0.01)) {
      action = "reject";
      reviewerNotes = this.rng.pick(REJECTION_NOTES_LATE);
    }
    try {
      await this.ctx.api.as(mod.discordId).patch(`/api/bingos/${this.ctx.slug}/mod/submissions/${sub.id}`, { action, reviewerNotes }, { at });
    } catch (err) {
      this.note(err, `review ${action}`);
      return;
    }
    this.stamp(at);
    sub.team.dirty = true;
    sub.state.outstanding = Math.max(0, sub.state.outstanding - 1);
    if (action === "approve") {
      sub.status = "approved";
      this.summary.approved++;
      this.maybeUndo(mod, sub, at);
    } else {
      sub.status = "rejected";
      sub.team.live.delete(sub.id); // a rejection frees the item
      this.summary.rejected++;
      sub.state.resubmitting++;
      const when = new Date(at.getTime() + this.rng.int(10, 60) * MINUTE);
      this.at(when, () => this.submit(sub.team, sub.state, sub.claims, sub.by, when, true));
    }
  }

  /** Once per run, a mod sends an approval back to pending, then approves it again a few minutes later. */
  private maybeUndo(mod: Player, sub: Submission, at: Date): void {
    const { tl } = this.ctx;
    const span = (tl.stage === "complete" ? tl.endsAt : this.ctx.limit).getTime() - tl.startsAt.getTime();
    if (this.undoDone || at.getTime() - tl.startsAt.getTime() < span * 0.6 || !this.rng.chance(0.08)) return;
    this.undoDone = true;
    const undoAt = new Date(at.getTime() + 2 * MINUTE);
    const approveAt = new Date(at.getTime() + 12 * MINUTE);
    const path = `/api/bingos/${this.ctx.slug}/mod/submissions/${sub.id}`;
    this.at(undoAt, async () => {
      try {
        await this.ctx.api.as(mod.discordId).patch(path, { action: "undo" }, { at: undoAt });
        this.stamp(undoAt);
        sub.status = "pending";
        sub.reviewScheduled = true;
        sub.state.outstanding++;
        this.summary.approved--;
        sub.team.dirty = true;
      } catch (err) {
        this.note(err, "undo");
      }
    });
    this.at(approveAt, async () => {
      if (sub.status !== "pending") return;
      try {
        await this.ctx.api.as(mod.discordId).patch(path, { action: "approve" }, { at: approveAt });
        this.stamp(approveAt);
        sub.status = "approved";
        sub.state.outstanding = Math.max(0, sub.state.outstanding - 1);
        this.summary.approved++;
        sub.team.dirty = true;
      } catch (err) {
        this.note(err, "re-approve");
      }
    });
  }

  private async adjustPoints(at: Date): Promise<void> {
    const team = this.rng.pick(this.teams);
    const mod = this.rng.pick(this.mods);
    try {
      await this.ctx.api.as(mod.discordId).post(`/api/bingos/${this.ctx.slug}/mod/teams/${team.id}/adjustments`, { amount: 15, reason: "Bonus: best screenshot of the day" }, { at });
      this.stamp(at);
      team.dirty = true;
    } catch (err) {
      this.note(err, "adjust");
    }
  }

  // -------------------------------------------------------------------------
  // What the server thinks
  // -------------------------------------------------------------------------

  private async refresh(team: SimTeam): Promise<TeamProgressSummary> {
    const progress = await this.ctx.api.as(this.ctx.admin).get<TeamProgressSummary>(`/api/bingos/${this.ctx.slug}/teams/${team.id}/progress`);
    team.completed = new Set(progress.nodeStates.map((s) => s.nodeId));
    team.dirty = false;
    for (const state of team.parts.values()) {
      if (team.completed.has(state.part.id) || state.stuck) continue;
      // Everything planned has been posted and reviewed, and the part still isn't done: plan another go.
      if (state.cursor >= state.plan.length && state.outstanding === 0 && state.resubmitting === 0) {
        if (state.replans >= 3) state.stuck = true;
        else this.replan(team, state);
      }
    }
    return progress;
  }

  private async refreshDirty(): Promise<void> {
    for (const team of this.teams) if (team.dirty) await this.refresh(team);
  }

  private async refreshAll(): Promise<void> {
    for (const team of this.teams) await this.refresh(team);
  }

  private conflicts(team: SimTeam, claims: Claim[]): boolean {
    return this.board.exclusivityConflicts([...team.live.values()].flat(), claims.map((c) => c.nodeId)).length > 0;
  }

  private replan(team: SimTeam, state: PartState): void {
    state.replans++;
    state.plan = planSubmissions(state.part.node, this.rng);
    state.costs = costsFor(state.part, state.plan.length, team.costMult, this.rng);
    state.cursor = 0;
    state.effort = 0;
  }

  private finish(): SimSummary {
    const s = this.summary;
    s.pendingAtEnd = this.pending.filter((p) => p.status === "pending").length;
    s.teams = this.teams.map((team) => ({
      name: team.name,
      members: team.members.length,
      partsDone: this.reachable.filter((p) => team.completed.has(p.id)).length,
      partsTotal: this.reachable.length,
      target: team.target,
      points: 0,
      pending: this.pending.filter((p) => p.team === team && p.status === "pending").length,
    }));
    return s;
  }

  async fillPoints(): Promise<void> {
    for (const [i, team] of this.teams.entries()) {
      const progress = await this.ctx.api.as(this.ctx.admin).get<TeamProgressSummary>(`/api/bingos/${this.ctx.slug}/teams/${team.id}/progress`);
      this.summary.teams[i]!.points = progress.totalPoints;
    }
  }
}

export function costsFor(part: PartModel, submissions: number, costMult: number, rng: Rng): number[] {
  const each = (part.effort * costMult) / Math.max(1, submissions);
  return Array.from({ length: submissions }, () => each * rng.between(0.6, 1.4));
}

export function newPartState(part: PartModel, costMult: number, rng: Rng): PartState {
  const plan = planSubmissions(part.node, rng);
  return { part, plan, costs: costsFor(part, plan.length, costMult, rng), cursor: 0, effort: 0, outstanding: 0, resubmitting: 0, replans: 0, conflictReplans: 0, stuck: false };
}

export const describe = (s: SimSummary): string =>
  `${s.submitted} submitted, ${s.approved} approved, ${s.rejected} rejected, ${s.pendingAtEnd} still pending` +
  (s.earliest && s.latest ? `, ${fmt(s.earliest)} to ${fmt(s.latest)}` : "");
