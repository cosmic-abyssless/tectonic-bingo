// The spec for who may do what (CONTEXT.md "Action"; docs/adr/0001-permissions.md): every Role × Action × Stage, with
// why a refusal is refused. Written out by hand rather than read off GRANTS, so a change to the grants has to change
// this table too.
import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  can,
  isRestrictionTarget,
  mayRestrict,
  OPEN_TO_EVERYONE,
  resolvePermissions,
  RESTRICTABLE_ACTIONS,
  restrictedBy,
  STAGE_ORDER,
  unavailableReason,
  type Action,
  type PermissionDenial,
  type RestrictionTarget,
  type Role,
  type Stage,
} from "@bingo/shared";

// One character per stage, in STAGE_ORDER (planning, signup, captains, draft, reveal, live, complete):
// "+" allowed, "r" refused for the role, "s" refused for the stage, "x" refused by a rule for everyone. The Bingo shows
// screenshots once Finished (the default); with that off, see below.
type Row = string;
const ALL = "+++++++";
const NONE = "rrrrrrr";
// Refused for the role, but open to everyone once the Bingo is Finished.
const FINISHED = "rrrrrr+";

const TABLE: Record<Action, Record<Role, Row>> = {
  administer_site: { admin: ALL, moderator: NONE, staff: NONE, captain: NONE, player: NONE },
  administer_bingo: { admin: ALL, moderator: NONE, staff: NONE, captain: NONE, player: NONE },
  moderate_bingo: { admin: ALL, moderator: ALL, staff: NONE, captain: NONE, player: NONE },
  submit: { admin: ALL, moderator: NONE, staff: NONE, captain: NONE, player: ALL },
  submit_for_any_team: { admin: ALL, moderator: ALL, staff: NONE, captain: NONE, player: NONE },
  react: { admin: ALL, moderator: NONE, staff: NONE, captain: NONE, player: ALL },
  make_draft_pick: { admin: "xxx+xxx", moderator: NONE, staff: NONE, captain: "xxx+xxx", player: NONE },
  run_draft: { admin: "xxx+xxx", moderator: NONE, staff: NONE, captain: NONE, player: NONE },
  rate_picks: { admin: "+++++xx", moderator: NONE, staff: NONE, captain: "+++++xx", player: NONE },
  rename_team: { admin: ALL, moderator: NONE, staff: NONE, captain: "ssss+ss", player: NONE },
  mark_buyins: { admin: "x++++xx", moderator: "x++++xx", staff: "s++++ss", captain: NONE, player: NONE },
  view_bingo: { admin: ALL, moderator: ALL, staff: FINISHED, captain: FINISHED, player: "s++++++" },
  view_hidden_board: { admin: ALL, moderator: ALL, staff: NONE, captain: NONE, player: NONE },
  view_other_teams: { admin: ALL, moderator: ALL, staff: FINISHED, captain: FINISHED, player: FINISHED },
  view_team_stats: { admin: ALL, moderator: NONE, staff: NONE, captain: NONE, player: "sssss+s" },
  view_mod_activity: { admin: ALL, moderator: ALL, staff: NONE, captain: NONE, player: NONE },
  view_other_teams_screenshots: { admin: ALL, moderator: ALL, staff: FINISHED, captain: FINISHED, player: FINISHED },
  view_wrapped_preview: { admin: ALL, moderator: ALL, staff: NONE, captain: NONE, player: NONE },
  view_draft_room: { admin: ALL, moderator: ALL, staff: FINISHED, captain: "s++sss+", player: "ss+++++" },
  view_draft_pool_answers: { admin: ALL, moderator: ALL, staff: NONE, captain: ALL, player: NONE },
  view_player_card_answers: { admin: ALL, moderator: ALL, staff: NONE, captain: "s+++sss", player: NONE },
  view_mod_questions: { admin: ALL, moderator: ALL, staff: NONE, captain: NONE, player: NONE },
  view_admin_questions: { admin: ALL, moderator: NONE, staff: NONE, captain: NONE, player: NONE },
  view_any_player: { admin: ALL, moderator: ALL, staff: NONE, captain: NONE, player: NONE },
  view_buyins: { admin: ALL, moderator: ALL, staff: "s++++ss", captain: NONE, player: NONE },
};

const CODES: Record<string, PermissionDenial | null> = { "+": null, r: "role", s: "stage", x: "rule" };

function outcome(roles: Role[], stage: Stage, action: Action, showScreenshotsWhenFinished = true): PermissionDenial | null {
  const result = can(roles, { stage, showScreenshotsWhenFinished }, action);
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

  it("refuses everything to someone with no role, but what a Finished Bingo opens to everyone", () => {
    for (const action of ACTIONS) {
      for (const stage of STAGE_ORDER) expect(outcome([], stage, action)).toBe(stage === "complete" && OPEN_TO_EVERYONE[action] ? null : "role");
    }
    expect(Object.keys(OPEN_TO_EVERYONE).sort()).toEqual(["view_bingo", "view_draft_room", "view_other_teams", "view_other_teams_screenshots"]);
  });

  it("keeps other Teams' screenshots to Moderators and Admins when the Bingo doesn't show them once Finished", () => {
    expect(outcome([], "complete", "view_other_teams_screenshots", false)).toBe("role");
    expect(outcome(["captain", "player"], "complete", "view_other_teams_screenshots", false)).toBe("role");
    expect(outcome(["moderator"], "complete", "view_other_teams_screenshots", false)).toBeNull();
    expect(outcome(["admin"], "complete", "view_other_teams_screenshots", false)).toBeNull();
    // Other Teams' Submissions themselves stay open.
    expect(outcome(["player"], "complete", "view_other_teams", false)).toBeNull();
  });

  describe("combines roles", () => {
    it("lets a Moderator who also plays moderate", () => {
      expect(outcome(["moderator", "player"], "live", "moderate_bingo")).toBeNull();
      expect(outcome(["moderator", "player"], "live", "submit_for_any_team")).toBeNull();
    });

    it("gives a Captain who is also a Player the Captain's Actions, in the Captain's stages", () => {
      expect(outcome(["captain", "player"], "draft", "make_draft_pick")).toBeNull();
      expect(outcome(["captain", "player"], "draft", "rename_team")).toBe("stage");
      expect(outcome(["captain", "player"], "reveal", "rename_team")).toBeNull();
      expect(outcome(["captain", "player"], "live", "rename_team")).toBe("stage");
      expect(outcome(["captain", "player"], "draft", "run_draft")).toBe("role");
    });

    it("lets a Captain scout the draft room while Signups are open, before the other Players can", () => {
      expect(outcome(["captain", "player"], "signup", "view_draft_room")).toBeNull();
      expect(outcome(["player"], "signup", "view_draft_room")).toBe("stage");
      expect(outcome(["captain", "player"], "live", "view_draft_room")).toBeNull();
      expect(outcome(["captain", "player"], "live", "view_player_card_answers")).toBe("stage");
    });

    it("lets Staff who also play see the Bingo as a Player, and mark Buy-ins as Staff", () => {
      for (const stage of ["signup", "captains", "draft", "reveal"] as const) {
        expect(outcome(["staff", "player"], stage, "view_bingo")).toBeNull();
        expect(outcome(["staff", "player"], stage, "view_buyins")).toBeNull();
        expect(outcome(["staff", "player"], stage, "mark_buyins")).toBeNull();
        expect(outcome(["staff", "captain", "player"], stage, "mark_buyins")).toBeNull();
      }
      expect(outcome(["staff", "player"], "live", "view_bingo")).toBeNull();
      expect(outcome(["staff", "player"], "live", "view_team_stats")).toBeNull();
      expect(outcome(["staff", "player"], "live", "view_buyins")).toBe("stage");
      expect(outcome(["staff", "player"], "live", "mark_buyins")).toBe("stage");
      // Staff adds nothing a Moderator would see.
      for (const action of ["moderate_bingo", "view_other_teams", "view_mod_questions", "view_draft_pool_answers", "view_player_card_answers", "view_hidden_board"] as const) {
        expect(outcome(["staff", "player"], "draft", action), action).toBe(outcome(["player"], "draft", action));
      }
    });

    it("keeps a Moderator's Buy-in powers whether or not they're Staff too", () => {
      expect(outcome(["moderator", "staff"], "live", "view_buyins")).toBeNull();
      expect(outcome(["moderator", "staff"], "reveal", "mark_buyins")).toBeNull();
      expect(outcome(["moderator", "staff"], "live", "mark_buyins")).toBe("rule");
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

  it("leaves renaming any Team outside Board revealed to Admins, from the mod panel", () => {
    for (const stage of ["draft", "live"] as const) {
      expect(outcome(["admin", "captain", "player"], stage, "rename_team")).toBeNull();
      expect(outcome(["admin"], stage, "administer_bingo")).toBeNull();
    }
    expect(outcome(["moderator", "captain", "player"], "live", "administer_bingo")).toBe("role");
  });

  it("answers outside any Bingo from the grants alone", () => {
    expect(can(["admin"], null, "administer_site")).toEqual({ ok: true });
    expect(can([], null, "administer_site")).toEqual({ ok: false, reason: "role" });
    expect(can(["captain"], null, "rename_team")).toEqual({ ok: false, reason: "stage" });
  });
});

describe("Restrictions", () => {
  const bingo = (stage: Stage) => ({ stage, showScreenshotsWhenFinished: true });
  const restricted = (action: string, reason = "Spamming the channel") => [{ action: action as RestrictionTarget, reason }];

  it("lists what can be restricted: Actions that do something, never a view, a Draft pick, or what only Admins hold", () => {
    expect([...RESTRICTABLE_ACTIONS].sort()).toEqual(["rate_picks", "react", "rename_team", "submit", "submit_for_any_team"]);
    for (const action of ACTIONS) {
      if (action.startsWith("view_") || action === "make_draft_pick") expect(isRestrictionTarget(action), action).toBe(false);
    }
  });

  // From the table: wherever a role grants a restrictable Action (allowed, or closed for the stage or by a rule), a
  // Restriction on it refuses it instead, whatever the stage.
  const restrictedCases = RESTRICTABLE_ACTIONS.flatMap((action) =>
    (["moderator", "captain", "player"] as const).flatMap((role) =>
      STAGE_ORDER.flatMap((stage, i) => (TABLE[action][role][i] === "r" ? [] : [{ action, role, stage }])),
    ),
  );
  it.each(restrictedCases)("beats $role's $action in $stage", ({ action, role, stage }) => {
    const roles: Role[] = role === "captain" ? ["captain", "player"] : [role];
    expect(can(roles, bingo(stage), action, restricted(action))).toEqual({ ok: false, reason: "restricted", restriction: restricted(action)[0] });
  });

  it("leaves a refusal by role a refusal by role", () => {
    expect(can(["moderator"], bingo("reveal"), "rename_team", restricted("rename_team"))).toEqual({ ok: false, reason: "role" });
  });

  it("doesn't hold for an Admin", () => {
    for (const action of RESTRICTABLE_ACTIONS) expect(can(["admin", "captain", "player"], bingo("reveal"), action, restricted("*")).ok, action).toBe(true);
  });

  it("takes only the Action named", () => {
    expect(can(["player"], bingo("live"), "submit", restricted("react")).ok).toBe(true);
    expect(can(["player"], bingo("live"), "react", restricted("react")).ok).toBe(false);
  });

  it("takes every restrictable Action a wildcard covers, and nothing else", () => {
    expect(restrictedBy("submit*")).toEqual(["submit", "submit_for_any_team"]);
    expect(can(["moderator", "player"], bingo("live"), "submit", restricted("submit*")).ok).toBe(false);
    expect(can(["moderator", "player"], bingo("live"), "submit_for_any_team", restricted("submit*")).ok).toBe(false);
    expect(can(["moderator", "player"], bingo("live"), "react", restricted("submit*")).ok).toBe(true);
    // "*" takes everything restrictable, but never what a user sees or a Captain's Draft pick.
    expect(restrictedBy("*")).toEqual([...RESTRICTABLE_ACTIONS]);
    expect(can(["captain", "player"], bingo("draft"), "make_draft_pick", restricted("*")).ok).toBe(true);
    expect(can(["moderator", "player"], bingo("live"), "view_bingo", restricted("*")).ok).toBe(true);
    expect(can(["moderator", "player"], bingo("live"), "moderate_bingo", restricted("*")).ok).toBe(true);
  });

  it("refuses to restrict a view, a Draft pick, or a wildcard that covers nothing restrictable", () => {
    for (const target of ["view_bingo", "view_*", "make_draft_pick", "make_*", "moderate_bingo", "administer_bingo", "sub*mit*", "nonsense", ""]) {
      expect(isRestrictionTarget(target), target).toBe(false);
    }
    for (const target of ["submit", "rename_team", "submit*", "r*", "*"]) expect(isRestrictionTarget(target), target).toBe(true);
  });

  it("tells the restricted user why, in the permissions response, with the Restriction's reason", () => {
    const { allowed, reasons } = resolvePermissions(["captain", "player"], bingo("reveal"), restricted("rename_team", "Offensive team names."));
    expect(allowed).not.toContain("rename_team");
    expect(reasons.rename_team).toBe("Restricted: Offensive team names");
    // Even where the stage closes it too: the Restriction is what they need to know about.
    expect(resolvePermissions(["captain", "player"], bingo("live"), restricted("rename_team")).reasons.rename_team).toBe("Restricted: Spamming the channel");
  });

  it("lets an Admin restrict anyone but an Admin, and a Moderator only Captains and Players", () => {
    expect(mayRestrict(["admin"], ["moderator", "player"])).toBe(true);
    expect(mayRestrict(["admin"], ["captain", "player"])).toBe(true);
    expect(mayRestrict(["admin"], ["admin", "player"])).toBe(false);
    expect(mayRestrict(["moderator"], ["captain", "player"])).toBe(true);
    expect(mayRestrict(["moderator"], ["player"])).toBe(true);
    expect(mayRestrict(["moderator"], ["moderator"])).toBe(false);
    expect(mayRestrict(["moderator"], ["moderator", "player"])).toBe(false);
    expect(mayRestrict(["moderator"], ["admin"])).toBe(false);
    // A role a Moderator isn't listed as restricting is refused, whatever it is (Staff, once it exists).
    expect(mayRestrict(["moderator"], ["player", "someone_else" as Role])).toBe(false);
    expect(mayRestrict(["captain", "player"], ["player"])).toBe(false);
    expect(mayRestrict(["player"], ["player"])).toBe(false);
  });
});

describe("why an Action is closed", () => {
  const bingo = (stage: Stage) => ({ stage, showScreenshotsWhenFinished: true });

  it("says so in words that can depend on the stage", () => {
    expect(unavailableReason(bingo("draft"), "rename_team")).toBe("Team names can be changed once the Board is revealed");
    expect(unavailableReason(bingo("live"), "rename_team")).toBe("Team names are locked once the Bingo is Live");
    expect(unavailableReason(bingo("complete"), "rename_team")).toBe("Team names are locked once the Bingo is Live");
    expect(unavailableReason(bingo("signup"), "view_draft_room")).toMatch(/captains and mods/);
    expect(unavailableReason(bingo("live"), "view_bingo")).toBe("Not available at this stage of the bingo");
  });

  it("is given for every Action a role grants but the stage or a rule closes, and for none it doesn't grant", () => {
    for (const stage of STAGE_ORDER) {
      for (const roles of [["admin"], ["moderator"], ["staff"], ["staff", "player"], ["captain", "player"], ["player"], []] as Role[][]) {
        const { allowed, reasons } = resolvePermissions(roles, bingo(stage));
        for (const action of ACTIONS) {
          const permission = can(roles, bingo(stage), action);
          expect(allowed.includes(action), `${roles} ${stage} ${action}`).toBe(permission.ok);
          expect(reasons[action], `${roles} ${stage} ${action}`).toBe(permission.ok || permission.reason === "role" ? undefined : unavailableReason(bingo(stage), action));
        }
      }
    }
  });
});
