import { evaluateGraph, type ApprovedClaim, type EngineNode, type NodeResult } from "./engine";

// Points share (CONTEXT.md): who on a team earned each award, from the Claims that completed it. Pure, like
// the engine it replays: the caller hands in the same graph and (exclusivity-filtered) approved claims the
// team's score was built from, plus the awards teamNodeState holds.

export interface CreditClaim extends ApprovedClaim {
  claimId: string;
  submissionId: string;
  /** The Player the drop belongs to (submissions.submittedByUserId). */
  userId: string;
}

export interface CreditedClaim {
  claimId: string;
  submissionId: string;
  nodeId: string;
  itemName: string | null;
  /** How much of the claim counted: a SUM's last claim only counts for what was still needed. */
  quantity: number;
}

export interface AwardShare {
  userId: string;
  points: number;
  /** Fraction of the award, 0..1. */
  fraction: number;
  claims: CreditedClaim[];
  /** Line bonuses only: the line's tiles this player had a share of. */
  viaTileNodeIds?: string[];
}

export interface AwardCredit {
  nodeId: string;
  kind: "task" | "tile" | "line";
  points: number;
  shares: AwardShare[];
}

type Fractions = Map<string, number>; // claimId → fraction of a node, summing to 1 for a complete node

function addInto(target: Fractions, source: Fractions, weight: number) {
  for (const [id, f] of source) target.set(id, (target.get(id) ?? 0) + f * weight);
}

const byReview = (a: CreditClaim, b: CreditClaim) => a.reviewedAt.getTime() - b.reviewedAt.getTime();

export function creditAwards(input: {
  nodes: EngineNode[];
  childrenOf: Map<string, string[]>;
  claims: CreditClaim[];
  awards: { nodeId: string; points: number }[];
  tileNodeIds: ReadonlySet<string>;
  lineNodeIds: ReadonlySet<string>;
}): AwardCredit[] {
  const { nodes, childrenOf, claims, tileNodeIds, lineNodeIds } = input;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const results = evaluateGraph(nodes, childrenOf, claims);
  const claimById = new Map(claims.map((c) => [c.claimId, c]));
  const claimsByNode = new Map<string, CreditClaim[]>();
  for (const c of claims) claimsByNode.set(c.nodeId, [...(claimsByNode.get(c.nodeId) ?? []), c]);
  // The part of each claim that counted, for display. A claim can count in several places (a shared pool);
  // the largest use is the one shown.
  const counted = new Map<string, number>();
  const count = (id: string, qty: number) => counted.set(id, Math.max(counted.get(id) ?? 0, qty));

  // Children that completed, earliest first; sort order breaks ties, as it does for the engine's ANY/COUNT.
  const completedChildren = (nodeId: string) =>
    (childrenOf.get(nodeId) ?? [])
      .map((id, order) => ({ id, order, r: results.get(id) as NodeResult | undefined }))
      .filter((c) => c.r?.complete && c.r.completedAt)
      .sort((a, b) => a.r!.completedAt!.getTime() - b.r!.completedAt!.getTime() || a.order - b.order);

  // Which claims decided a node, as fractions of it. Only the path that completed it counts: an ANY's first
  // child, a COUNT's first N, a SUM's claims up to its target. Claims after that decided nothing.
  const memo = new Map<string, Fractions>();
  function deciding(nodeId: string): Fractions {
    const cached = memo.get(nodeId);
    if (cached) return cached;
    const node = byId.get(nodeId);
    const out: Fractions = new Map();
    memo.set(nodeId, out);
    if (!node || !results.get(nodeId)?.complete) return out;
    switch (node.kind) {
      case "MANUAL":
      case "ITEM": {
        const first = [...(claimsByNode.get(nodeId) ?? [])].sort(byReview)[0];
        if (first) {
          out.set(first.claimId, 1);
          count(first.claimId, Math.min(first.quantity, 1));
        }
        break;
      }
      case "SUM": {
        const target = node.quantity ?? 1;
        let needed = target;
        for (const c of (childrenOf.get(nodeId) ?? []).flatMap((id) => claimsByNode.get(id) ?? []).sort(byReview)) {
          if (needed <= 0) break;
          const used = Math.min(c.quantity, needed);
          needed -= used;
          out.set(c.claimId, (out.get(c.claimId) ?? 0) + used / target);
          count(c.claimId, used);
        }
        break;
      }
      case "ALL": {
        const children = childrenOf.get(nodeId) ?? [];
        for (const id of children) addInto(out, deciding(id), 1 / children.length);
        break;
      }
      case "ANY":
      case "COUNT": {
        const n = node.kind === "ANY" ? 1 : (node.minCount ?? 1);
        const decided = completedChildren(nodeId).slice(0, n);
        for (const c of decided) addInto(out, deciding(c.id), 1 / decided.length);
        break;
      }
    }
    return out;
  }

  function sharesFrom(fractions: Fractions, points: number): AwardShare[] {
    const byUser = new Map<string, AwardShare>();
    for (const [claimId, fraction] of fractions) {
      const c = claimById.get(claimId)!;
      const share = byUser.get(c.userId) ?? { userId: c.userId, points: 0, fraction: 0, claims: [] };
      share.fraction += fraction;
      share.points += fraction * points;
      share.claims.push({ claimId, submissionId: c.submissionId, nodeId: c.nodeId, itemName: c.itemName, quantity: counted.get(claimId) ?? c.quantity });
      byUser.set(c.userId, share);
    }
    return [...byUser.values()];
  }

  const descendants = (rootId: string): Set<string> => {
    const seen = new Set<string>();
    const walk = (id: string) => {
      for (const child of childrenOf.get(id) ?? []) {
        if (seen.has(child)) continue;
        seen.add(child);
        walk(child);
      }
    };
    walk(rootId);
    return seen;
  };

  // Tasks and Parts first: they are what tile shares are built from.
  const taskCredits: AwardCredit[] = input.awards
    .filter((a) => !tileNodeIds.has(a.nodeId) && !lineNodeIds.has(a.nodeId))
    .map((a) => ({ nodeId: a.nodeId, kind: "task", points: a.points, shares: sharesFrom(deciding(a.nodeId), a.points) }));

  // A player's share of a tile: their part of the points credited inside it. A tile whose parts scored
  // nothing falls back to the claims that completed it.
  const tileShareMemo = new Map<string, Map<string, number>>();
  function tileShare(tileNodeId: string): Map<string, number> {
    const cached = tileShareMemo.get(tileNodeId);
    if (cached) return cached;
    const inside = descendants(tileNodeId);
    const byUser = new Map<string, number>();
    let total = 0;
    for (const credit of taskCredits) {
      if (!inside.has(credit.nodeId)) continue;
      for (const s of credit.shares) {
        byUser.set(s.userId, (byUser.get(s.userId) ?? 0) + s.points);
        total += s.points;
      }
    }
    if (total === 0) {
      for (const s of sharesFrom(deciding(tileNodeId), 1)) byUser.set(s.userId, s.fraction);
      total = 1;
    }
    const share = new Map([...byUser].map(([userId, pts]) => [userId, pts / total]));
    tileShareMemo.set(tileNodeId, share);
    return share;
  }

  const bonusCredits: AwardCredit[] = input.awards
    .filter((a) => tileNodeIds.has(a.nodeId) || lineNodeIds.has(a.nodeId))
    .map((a) => {
      if (tileNodeIds.has(a.nodeId)) {
        const shares = [...tileShare(a.nodeId)].map(([userId, fraction]) => ({ userId, fraction, points: fraction * a.points, claims: [] }));
        return { nodeId: a.nodeId, kind: "tile" as const, points: a.points, shares };
      }
      const lineTiles = (childrenOf.get(a.nodeId) ?? []).filter((id) => tileNodeIds.has(id));
      const byUser = new Map<string, AwardShare>();
      for (const tileNodeId of lineTiles) {
        for (const [userId, fraction] of tileShare(tileNodeId)) {
          if (fraction <= 0) continue;
          const share = byUser.get(userId) ?? { userId, points: 0, fraction: 0, claims: [], viaTileNodeIds: [] };
          share.fraction += fraction / lineTiles.length;
          share.points += (fraction / lineTiles.length) * a.points;
          share.viaTileNodeIds!.push(tileNodeId);
          byUser.set(userId, share);
        }
      }
      return { nodeId: a.nodeId, kind: "line" as const, points: a.points, shares: [...byUser.values()] };
    });

  return [...taskCredits, ...bonusCredits];
}
