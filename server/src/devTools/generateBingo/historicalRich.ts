// `--stage historical-rich`: the sections a rich historical bundle adds (shared/src/historicalBundle.ts, version 2),
// made up the way the converter would read them off an old site: the board's Tasks with their requirement trees and
// Lines, Signups with a few Cut signups, a Draft in snake order, and Submissions that complete some Tasks (a few of
// them rejected, a few with Proof screenshots). The Teams are rebuilt from the Draft so the picks line up with them.
import type { BingoExportDocument, ExportNode, HistoricalBundle, HistoricalBundleNode, HistoricalBundleSubmission, HistoricalBundleTask } from "@bingo/shared";
import type { Player } from "./people";
import type { Rng } from "./rng";
import { DAY, HOUR } from "./timeline";

const TIMEZONES = ["Europe/London", "Europe/Amsterdam", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney", null] as const;
const QUESTIONS = [
  { key: "hours", prompt: "How many hours a day can you play?", type: "text" as const },
  { key: "notes", prompt: "Anything the Captains should know?", type: "textarea" as const },
];
const NOTES = ["Happy to captain", "Mostly weekends", "New to raids", "Can teach ToB", "Out on the 3rd", "Mobile only at work"];

type Claim = NonNullable<HistoricalBundleSubmission["claims"]>[number];
type Keyed = { key: string };
const keyOf = (n: ExportNode) => `n${n.localId}`;

/** The leaves written so far, by key: what a stub (`reuse`) puts in a second place. */
type Written = Map<string, HistoricalBundleNode & Keyed>;

/**
 * A board node as a bundle node, or null when it can't be one (an ITEM without its item, an empty group, a reused group,
 * or a reused leaf that wasn't written). A leaf the board shares between Tasks stays shared: a stub after the first.
 */
function toNode(n: ExportNode, written: Written): (HistoricalBundleNode & Keyed) | null {
  if (n.reuse) return (n.kind === "ITEM" || n.kind === "MANUAL") && written.has(keyOf(n)) ? { kind: n.kind, key: keyOf(n), reuse: true } : null;
  const base = { key: keyOf(n), label: n.label, points: n.points };
  const leaf = (node: HistoricalBundleNode & Keyed) => (written.set(node.key, node), node);
  switch (n.kind) {
    case "ITEM":
      return n.itemName ? leaf({ ...base, kind: "ITEM", item: n.itemName, ...(n.valuedAs ? { valuedAs: n.valuedAs } : {}), ...(n.countsAs && n.countsAs !== 1 ? { countsAs: n.countsAs } : {}) }) : null;
    case "MANUAL":
      return leaf({ ...base, kind: "MANUAL" });
    case "SUM": {
      const children = n.children.map((c) => toNode(c, written)).filter((c): c is HistoricalBundleNode & Keyed => c?.kind === "ITEM");
      return children.length > 0 ? { ...base, kind: "SUM", quantity: Math.max(1, n.quantity ?? 1), children } : null;
    }
    default: {
      const children = n.children.map((c) => toNode(c, written)).filter((c) => c !== null);
      if (children.length === 0) return null;
      if (n.kind === "COUNT") return { ...base, kind: "COUNT", min: Math.min(Math.max(1, n.minCount ?? 1), children.length), children };
      return { ...base, kind: n.kind, children };
    }
  }
}

/** The Claims that would complete a node, picked at random where it offers a choice. */
function satisfy(n: HistoricalBundleNode & Partial<Keyed>, rng: Rng, written: Written): Claim[] {
  if ("reuse" in n) return satisfy(written.get(n.key)!, rng, written);
  switch (n.kind) {
    case "ITEM":
      return [{ leaf: n.key!, item: n.item, quantity: 1 }];
    case "MANUAL":
      return [{ leaf: n.key!, item: null, quantity: 1 }];
    case "ANY":
      return satisfy(rng.pick(n.children), rng, written);
    case "COUNT":
      return rng.shuffle(n.children).slice(0, n.min).flatMap((c) => satisfy(c, rng, written));
    case "SUM": {
      // The quantity, spread over its items, one drop at a time: an item that counts as N adds N (CONTEXT.md "Counts
      // as"), so it takes fewer drops.
      const counts = new Map<HistoricalBundleNode, number>();
      for (let remaining = n.quantity; remaining > 0; ) {
        const c = rng.pick(n.children);
        counts.set(c, (counts.get(c) ?? 0) + 1);
        remaining -= countsAs(c, written);
      }
      return [...counts].map(([c, quantity]) => ({ ...satisfy(c, rng, written)[0]!, quantity }));
    }
    default:
      return n.children.flatMap((c) => satisfy(c, rng, written));
  }
}

/** What one drop of a SUM's item adds to its total (a stub's, from the leaf written earlier). */
function countsAs(n: HistoricalBundleNode, written: Written): number {
  const leaf = "reuse" in n ? written.get(n.key) : n;
  return leaf && leaf.kind === "ITEM" && !("reuse" in leaf) ? (leaf.countsAs ?? 1) : 1;
}

/**
 * An item that counts as more than one (CONTEXT.md "Counts as"), as an old site's "N in total" sometimes had: unless the
 * board already has one, the last item of the first SUM over two or more items with a total of at least 3 counts as a
 * quarter of that total (from 2, at most 25), as the live generator does (board.ts's itemToWeigh).
 */
function weighAnItem(tiles: HistoricalBundle["tiles"]): void {
  const walk = (n: HistoricalBundleNode): HistoricalBundleNode[] => [n, ...("children" in n ? n.children.flatMap(walk) : [])];
  const nodes = tiles.flatMap((t) => (t.tasks ?? []).flatMap(walk));
  if (nodes.some((n) => n.kind === "ITEM" && !("reuse" in n) && (n.countsAs ?? 1) !== 1)) return;
  for (const n of nodes) {
    if (n.kind !== "SUM" || "reuse" in n || n.quantity < 3) continue;
    const items = n.children.filter((c) => c.kind === "ITEM" && !("reuse" in c));
    const last = items[items.length - 1];
    if (items.length < 2 || !last || last.kind !== "ITEM" || "reuse" in last) continue;
    last.countsAs = Math.min(25, Math.max(2, Math.floor(n.quantity / 4)));
    return;
  }
}

const isStub = (n: HistoricalBundleNode): boolean => "reuse" in n;
const hasStub = (n: HistoricalBundleNode): boolean => isStub(n) || ("children" in n && n.children.some(hasStub));
const firstItem = (n: HistoricalBundleNode): (HistoricalBundleNode & Keyed) | null =>
  n.kind === "ITEM" && !isStub(n) ? (n as HistoricalBundleNode & Keyed) : "children" in n ? n.children.map(firstItem).find((c) => c) ?? null : null;

/**
 * A drop that counts toward two Tasks, as an old site's did: unless the board already shares a leaf between Tasks, the
 * first Tile whose second Task is a group (other than ALL, which it would add a requirement to) also offers an item of
 * its first Task.
 */
function shareALeaf(tiles: HistoricalBundle["tiles"]): void {
  if (tiles.some((t) => t.tasks?.some(hasStub))) return;
  for (const t of tiles) {
    const [a, b] = t.tasks ?? [];
    const item = a && firstItem(a);
    if (!item || !b || !(b.kind === "ANY" || b.kind === "COUNT" || b.kind === "SUM") || isStub(b)) continue;
    if (b.children.some((c) => c.key === item.key)) continue;
    b.children.push({ kind: "ITEM", key: item.key, reuse: true });
    return;
  }
}

export interface RichInput {
  document: BingoExportDocument;
  rng: Rng;
  startsAt: Date;
  endsAt: Date;
  /** Signed up but not drafted. */
  cut: Player[];
}

/** Adds the rich sections to a sparse bundle (and rebuilds its Teams from the Draft), in place. */
export function addRichSections(bundle: HistoricalBundle, { document, rng, startsAt, endsAt, cut }: RichInput): void {
  bundle.version = 2;
  const start = startsAt.getTime();
  const span = endsAt.getTime() - start;

  // Tasks, from the board's.
  const taskRoots = new Map<string, HistoricalBundleTask & Keyed>(); // by key
  const tileOfTask = new Map<string, HistoricalBundle["tiles"][number]>();
  const written: Written = new Map();
  for (const t of document.tiles) {
    const tile = bundle.tiles.find((b) => b.boardRow === t.boardRow && b.boardCol === t.boardCol)!;
    const tasks: (HistoricalBundleTask & Keyed)[] = [];
    let previous: ExportNode | null = null;
    for (const n of t.tasks) {
      const node = toNode(n, written);
      if (!node) continue;
      const task = {
        ...node,
        label: n.label ?? n.itemName ?? `Task ${tasks.length + 1}`,
        description: n.description,
        points: n.points,
        withholdUntilPrevious: tasks.length > 0 && previous !== null && n.pointsGateLocalId === previous.localId,
        requiresProof: t.requiresProof ? false : n.requiresProof === true,
        proofNote: t.requiresProof ? null : (n.proofNote ?? null),
      } as HistoricalBundleTask & Keyed;
      tasks.push(task);
      taskRoots.set(task.key, task);
      tileOfTask.set(task.key, tile);
      previous = n;
    }
    Object.assign(tile, {
      points: t.bonusPoints ? t.bonusPoints : null,
      tasks,
      freezeMinutes: t.hasFreezePeriod && t.freezeDurationMinutes > 0 ? t.freezeDurationMinutes : null,
      requiresProof: t.requiresProof === true,
      proofNote: t.requiresProof ? (t.proofNote ?? null) : null,
    });
  }
  shareALeaf(bundle.tiles);
  weighAnItem(bundle.tiles);
  bundle.lines = document.lines.map((l) => ({ type: l.lineType, index: l.lineIndex, points: l.points }));

  // The Draft: the Captains (and some co-captains) lead, everyone else is picked in snake order, which makes the Teams.
  const draftRng = rng.fork("draft");
  const order = draftRng.shuffle(bundle.teams.map((t) => t.name));
  const byName = new Map(bundle.teams.map((t) => [t.name, t]));
  const leads = new Set(bundle.teams.flatMap((t) => [t.captain, ...(t.coCaptain ? [t.coCaptain] : [])]));
  const pool = draftRng.shuffle(bundle.teams.flatMap((t) => t.players).filter((id) => !leads.has(id)));
  for (const t of bundle.teams) t.players = [t.captain, ...(t.coCaptain ? [t.coCaptain] : [])];
  const picks = pool.map((player, i) => {
    const round = Math.floor(i / order.length);
    const slot = i % order.length;
    const team = order[round % 2 === 0 ? slot : order.length - 1 - slot]!;
    byName.get(team)!.players.push(player);
    return { pick: i + 1, team, player };
  });
  bundle.draft = { at: new Date(start - DAY).toISOString(), order, picks };

  // Signups, before the Draft; the Cut signups among them.
  const signupRng = rng.fork("signups");
  const entry = (discordId: string) => ({
    discordId,
    signedUpAt: new Date(start - DAY - signupRng.int(1, 14 * 24) * HOUR).toISOString(),
    timezone: signupRng.pick(TIMEZONES),
    answers: { hours: String(signupRng.int(1, 8)), ...(signupRng.chance(0.3) ? { notes: signupRng.pick(NOTES) } : {}) },
  });
  bundle.signups = {
    questions: QUESTIONS,
    entries: [
      ...bundle.players.map((p) => ({ ...entry(p.discordId), cut: false })),
      ...cut.map((p) => ({ ...entry(p.discordId), cut: true, rsn: p.name, clan: signupRng.chance(0.8) ? { name: p.discordName } : null })),
    ],
  };

  // Submissions: each Team completes some Tasks (some only in part), a drop or two rejected on the way.
  const playRng = rng.fork("play");
  // Drop values as the old site's time priced them, made up: each item one price, on about two drops in three. The rest
  // are priced at today's prices when imported.
  const valueRng = rng.fork("values");
  const unitPrice = new Map<string, number>();
  const valued = (claim: Claim): Claim => {
    if (!claim.item || !valueRng.chance(2 / 3)) return claim;
    if (!unitPrice.has(claim.item)) unitPrice.set(claim.item, valueRng.int(1_000, 20_000_000));
    return { ...claim, value: unitPrice.get(claim.item)! * claim.quantity };
  };
  const submissions: HistoricalBundleSubmission[] = [];
  const at = (from: number) => new Date(from + playRng.float() * (start + span - 3 * HOUR - from));
  const submit = (team: HistoricalBundle["teams"][number], when: Date, status: "approved" | "rejected", rest: Partial<HistoricalBundleSubmission>) => {
    const key = `s${submissions.length + 1}`;
    submissions.push({
      key, team: team.name, player: playRng.pick(team.players), submittedAt: when.toISOString(), reviewedAt: new Date(when.getTime() + playRng.int(5, 180) * 60_000).toISOString(),
      status, screenshot: playRng.chance(0.95) ? `shot-${key}` : null, ...rest,
    });
  };
  for (const team of bundle.teams) {
    const strength = playRng.between(0.3, 0.8);
    const provedTiles = new Set<string>();
    for (const [key, task] of taskRoots) {
      const done = playRng.chance(strength);
      if (task.kind === "MANUAL") {
        if (done) (task.completions ??= []).push({ team: team.name, at: at(start).toISOString() });
        continue;
      }
      const claims = satisfy(task, playRng, written).map(valued);
      const made = done ? claims : claims.slice(0, playRng.chance(0.4) ? 1 : 0);
      let last = start;
      for (const claim of made) {
        const when = at(start);
        if (playRng.chance(0.1)) submit(team, new Date(when.getTime() - HOUR), "rejected", { claims: [claim] });
        submit(team, when, "approved", { claims: [claim] });
        last = Math.max(last, when.getTime());
      }
      if (made.length === 0) continue;
      const tile = tileOfTask.get(key)!;
      if (done && task.requiresProof) submit(team, new Date(last + HOUR), "approved", { kind: "proof", proof: { boardRow: tile.boardRow, boardCol: tile.boardCol, task: key } });
      if (tile.requiresProof && !provedTiles.has(`${tile.boardRow},${tile.boardCol}`)) {
        provedTiles.add(`${tile.boardRow},${tile.boardCol}`);
        submit(team, new Date(last + HOUR), "approved", { kind: "proof", proof: { boardRow: tile.boardRow, boardCol: tile.boardCol, task: null } });
      }
    }
  }
  bundle.submissions = submissions;
}
