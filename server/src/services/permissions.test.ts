// The spec for who may do what (CONTEXT.md "Action"; docs/adr/0001-permissions.md): every Role × Action × Stage, with
// why a refusal is refused. Written out by hand rather than read off GRANTS, so a change to the grants has to change
// this table too.
import { describe, expect, it } from "vitest";
import { ACTIONS, can, STAGE_ORDER, type Action, type PermissionDenial, type Role, type Stage } from "@bingo/shared";

// One character per stage, in STAGE_ORDER (planning, signup, captains, draft, reveal, live, complete):
// "+" allowed, "r" refused for the role, "s" refused for the stage, "x" refused by a rule for everyone.
type Row = string;
const ALL = "+++++++";
const NONE = "rrrrrrr";

const TABLE: Record<Action, Record<Role, Row>> = {
  administer_site: { admin: ALL, moderator: NONE, captain: NONE, player: NONE },
  administer_bingo: { admin: ALL, moderator: NONE, captain: NONE, player: NONE },
  moderate_bingo: { admin: ALL, moderator: ALL, captain: NONE, player: NONE },
  submit_for_any_team: { admin: ALL, moderator: ALL, captain: NONE, player: NONE },
  make_draft_pick: { admin: "xxx+xxx", moderator: NONE, captain: "xxx+xxx", player: NONE },
  run_draft: { admin: "xxx+xxx", moderator: NONE, captain: NONE, player: NONE },
  rate_picks: { admin: "+++++xx", moderator: NONE, captain: "+++++xx", player: NONE },
  rename_team: { admin: ALL, moderator: NONE, captain: "+++++ss", player: NONE },
};

const CODES: Record<string, PermissionDenial | null> = { "+": null, r: "role", s: "stage", x: "rule" };

function outcome(roles: Role[], stage: Stage, action: Action): PermissionDenial | null {
  const result = can(roles, { stage }, action);
  return result.ok ? null : result.reason;
}

describe("can()", () => {
  it("has a row for every Action", () => {
    expect(Object.keys(TABLE).sort()).toEqual([...ACTIONS].sort());
  });

  const cases = ACTIONS.flatMap((action) =>
    (Object.keys(TABLE[action]) as Role[]).flatMap((role) => STAGE_ORDER.map((stage, i) => ({ action, role, stage, expected: CODES[TABLE[action][role][i]!]! }))),
  );
  it.each(cases)("$role, $action, $stage: $expected", ({ action, role, stage, expected }) => {
    expect(outcome([role], stage, action)).toBe(expected);
  });

  it("refuses everything to someone with no role", () => {
    for (const action of ACTIONS) for (const stage of STAGE_ORDER) expect(outcome([], stage, action)).toBe("role");
  });

  describe("combines roles", () => {
    it("lets a Moderator who also plays moderate", () => {
      expect(outcome(["moderator", "player"], "live", "moderate_bingo")).toBeNull();
      expect(outcome(["moderator", "player"], "live", "submit_for_any_team")).toBeNull();
    });

    it("gives a Captain who is also a Player the Captain's Actions, in the Captain's stages", () => {
      expect(outcome(["captain", "player"], "draft", "make_draft_pick")).toBeNull();
      expect(outcome(["captain", "player"], "reveal", "rename_team")).toBeNull();
      expect(outcome(["captain", "player"], "live", "rename_team")).toBe("stage");
      expect(outcome(["captain", "player"], "draft", "run_draft")).toBe("role");
    });

    it("doesn't widen a Captain's stages with a role that doesn't grant the Action", () => {
      expect(outcome(["moderator", "captain", "player"], "live", "rename_team")).toBe("stage");
    });
  });

  it("holds an Admin to the rules for everyone", () => {
    expect(outcome(["admin"], "live", "make_draft_pick")).toBe("rule");
    expect(outcome(["admin"], "complete", "run_draft")).toBe("rule");
    expect(outcome(["admin", "captain", "player"], "live", "rate_picks")).toBe("rule");
  });

  it("answers outside any Bingo from the grants alone", () => {
    expect(can(["admin"], null, "administer_site")).toEqual({ ok: true });
    expect(can([], null, "administer_site")).toEqual({ ok: false, reason: "role" });
    expect(can(["captain"], null, "rename_team")).toEqual({ ok: false, reason: "stage" });
  });
});
