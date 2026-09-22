import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, condenseAuditEntries, renderAuditLabel, type AuditAction, type AuditDetailsMap, type AuditEntry } from "@bingo/shared";

// Entries are built by hand: condensing is a pure function of one page of entries (newest first).
let nextId = 1000;
function entry<A extends AuditAction>(
  action: A,
  details: AuditDetailsMap[A],
  who: { actor?: string; team?: string } = {},
): AuditEntry {
  const actor = who.actor ?? "mod1";
  const base = {
    action,
    details,
    entityLabel: null,
    actor: { id: actor, discordUsername: actor, discordGlobalName: null, discordGuildNick: null },
    team: { id: who.team ?? "teamA", name: "Comfy", color: null },
    onBehalfOf: null,
  };
  const def = AUDIT_ACTIONS[action];
  return {
    ...base,
    id: nextId--, // newest first, so ids fall as we go down the list
    bingoId: "b1",
    at: new Date(2026, 0, 1, 12, 0, 0, nextId).toISOString(),
    category: def.category,
    label: renderAuditLabel(base),
    tone: def.tone,
    visibility: "team",
    actorType: "user",
    actorRole: "mod",
    entityType: "submission",
    entityId: null,
    requestId: null,
  };
}

const approved = (tileName: string, who?: { actor?: string; team?: string }) =>
  entry("submission.approved", { tileName, taskLabels: [], nodeIds: [], newlyCompletedNodeIds: [], pointsDelta: 20, reviewerNotes: null, submittedByUserId: "u" }, who);
const earned = (points: number, who?: { actor?: string; team?: string }) =>
  entry("points.earned", { source: "task", nodeId: `n${points}`, nodeLabel: "Part A", tileName: "Vorkath", points, submissionId: "s" }, who);
const created = (tileName: string, itemName: string, quantity = 1) =>
  entry("submission.created", { tileId: "t", tileName, taskLabels: [], claims: [{ nodeId: "n", itemName, quantity }], screenshotUrl: "/x.png" }, { actor: "player1" });

describe("condenseAuditEntries", () => {
  it("collapses five approvals into one line and leaves every points entry as it was, in order", () => {
    // Newest first, as the queries return: each approval sits below the points it awarded (they were written after it).
    const page = [
      earned(20), approved("Vorkath"), // newest approval
      earned(25), approved("Vorkath"),
      earned(30), approved("Zulrah"),
      earned(35), approved("Zulrah"),
      earned(40), approved("Cerberus"),
    ];

    const out = condenseAuditEntries(page);

    // The batch's points stay together above the one line that summarises it, which sits where the oldest approval was.
    expect(out.map((e) => e.action)).toEqual(["points.earned", "points.earned", "points.earned", "points.earned", "points.earned", "submission.approved"]);
    expect(out[5]!.label).toBe('mod1 approved 5 submissions for "Vorkath", "Zulrah" and "Cerberus"');
    expect(out[5]!.id).toBe(page[1]!.id); // the newest member still supplies the id and timestamp
    expect(out[5]!.condensed).toEqual({ count: 5, ids: [1, 3, 5, 7, 9].map((i) => page[i]!.id), oldestAt: page[9]!.at });
    // Every points entry survives untouched (same objects, same order).
    expect(out.slice(0, 5)).toEqual([0, 2, 4, 6, 8].map((i) => page[i]!));
    expect(out.slice(0, 5).every((e) => e.condensed === undefined)).toBe(true);
  });

  it("switches to a count once approvals span more than three tiles", () => {
    const out = condenseAuditEntries(["A", "B", "C", "D"].map((t) => approved(t)));
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toBe("mod1 approved 4 submissions for 4 tiles");
  });

  it("does not merge across a different actor or team; each stretch is condensed on its own", () => {
    const out = condenseAuditEntries([approved("A"), approved("B"), approved("C", { actor: "mod2" }), approved("D", { actor: "mod2" }), approved("E"), approved("F", { team: "teamB" })]);

    expect(out.map((e) => e.condensed?.count ?? 1)).toEqual([2, 2, 1, 1]);
    expect(out.map((e) => e.label)).toEqual([
      'mod1 approved 2 submissions for "A" and "B"',
      'mod2 approved 2 submissions for "C" and "D"',
      'mod1 approved a submission for "E"',
      'mod1 approved a submission for "F"',
    ]);
  });

  it("passes actions that have no condense renderer through untouched, even inside a run", () => {
    const adjusted = entry("points.adjusted", { amount: 10, reason: "bonus" });
    const renamed = entry("team.updated", { changes: { before: { name: "Old" }, after: { name: "New" } } });
    expect(AUDIT_ACTIONS["points.adjusted"].condense).toBeUndefined();
    expect(AUDIT_ACTIONS["points.earned"].condense).toBeUndefined();

    const out = condenseAuditEntries([approved("A"), adjusted, approved("B"), renamed, approved("C")]);

    expect(out.map((e) => e.action)).toEqual(["points.adjusted", "team.updated", "submission.approved"]);
    expect(out[0]).toBe(adjusted);
    expect(out[1]).toBe(renamed);
    expect(out[2]!.condensed?.count).toBe(3);
  });

  it("returns a lone entry unchanged, with no condensed marker", () => {
    const only = approved("A");
    const out = condenseAuditEntries([only]);
    expect(out).toEqual([only]);
    expect(out[0]!.condensed).toBeUndefined();
  });

  it("merges the items across several submissions into one line", () => {
    const out = condenseAuditEntries([created("GWD ISSUE 2", "Armadyl crossbow"), created("GWD ISSUE 2", "Bandos hilt", 2), created("GWD ISSUE 2", "Armadyl crossbow")]);
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toBe('player1 submitted 2× Armadyl crossbow and 2× Bandos hilt for "GWD ISSUE 2"');
  });

  it("lists who was added, oldest first", () => {
    const added = (displayName: string) => entry("team.member_added", { userId: displayName, displayName });
    const out = condenseAuditEntries([added("Cara"), added("Bob"), added("Al")]);
    expect(out[0]!.label).toBe("mod1 added Al, Bob and Cara to Comfy");
  });

  it("returns an empty page as an empty page", () => {
    expect(condenseAuditEntries([])).toEqual([]);
  });

  it("passes through a historical entry whose action isn't in the current registry, instead of crashing", () => {
    // A real scenario, not just a defensive hypothetical: an action can be renamed or removed (as dev.signups_*
    // was) while old rows recorded under it stay in the DB forever. AUDIT_ACTIONS[action] is undefined for it —
    // condenseRun's own `.condense` lookup has to survive that.
    const removedAction = "some.removed_action" as unknown as AuditAction;
    const unknown: AuditEntry = {
      action: removedAction,
      details: {} as never,
      entityLabel: null,
      // A different actor/team than the approvals around it, on purpose — same as any of the other "doesn't
      // merge across a different actor" cases above, so it starts its own run and this test isn't also
      // exercising (or accidentally depending on) merge behaviour, just "doesn't crash, passes through as-is".
      actor: { id: "mod2", discordUsername: "mod2", discordGlobalName: null, discordGuildNick: null },
      team: { id: "teamB", name: "Awkward", color: null },
      onBehalfOf: null,
      id: 500,
      bingoId: "b1",
      at: new Date(2026, 0, 1).toISOString(),
      category: "system",
      label: "mod1 did something no longer in the registry",
      tone: "warn",
      visibility: "mods",
      actorType: "user",
      actorRole: "mod",
      entityType: "bingo",
      entityId: null,
      requestId: null,
    };

    const out = condenseAuditEntries([approved("A"), unknown, approved("B")]);
    expect(out.map((e) => e.action)).toEqual(["submission.approved", removedAction, "submission.approved"]);
    expect(out[1]).toBe(unknown);
  });
});
