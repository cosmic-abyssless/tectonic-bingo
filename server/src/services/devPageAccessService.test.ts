import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import type { SessionUser } from "../types";
import { DEV_RANK, devPageAccess } from "./devPageAccessService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;
let people: Record<"admin" | "mod" | "captain" | "member" | "signedUp" | "stranger" | "outsider", SessionUser>;

function user(discordId: string, extra: Partial<SessionUser> = {}): SessionUser {
  return db.insert(schema.users).values({ discordId, discordUsername: discordId, ...extra }).returning().get();
}

function bingoIn(stage: "planning" | "signup" | "captains" | "draft" | "live") {
  db.update(schema.bingos).set({ stage }).run();
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  people = {
    admin: user("admin", { isAdmin: true }),
    mod: user("mod"),
    captain: user("captain"),
    member: user("member"),
    signedUp: user("signedUp"),
    stranger: user("stranger"),
    outsider: user("outsider", { inGuild: false }),
  };
  const bingo = db.insert(schema.bingos).values({ slug: "b1", name: "B1", boardRows: 5, boardCols: 5, createdByUserId: people.admin.id, stage: "draft" }).returning().get();
  db.insert(schema.bingoModerators).values({ bingoId: bingo.id, userId: people.mod.id }).run();
  for (const u of [people.captain, people.member, people.signedUp, people.outsider]) db.insert(schema.signups).values({ bingoId: bingo.id, userId: u.id, rsn: u.discordId }).run();
  const team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: people.captain.id, name: "Team A", codeword: "alpha" }).returning().get();
  db.insert(schema.teamMembers).values([
    { teamId: team.id, userId: people.captain.id, isCaptain: true },
    { teamId: team.id, userId: people.member.id },
  ]).run();
});
afterEach(() => {
  sqlite.close();
});

function who(path: string) {
  const access = devPageAccess(db, path, Object.values(people));
  return Object.fromEntries(Object.entries(people).map(([k, u]) => [k, access.get(u.id)!]));
}
const allowed = (path: string) => Object.entries(who(path)).filter(([, a]) => a.access).map(([k]) => k);

describe("devPageAccess", () => {
  it("lets only site admins into /admin", () => {
    expect(allowed("/admin")).toEqual(["admin"]);
  });

  it("lets mods and site admins into a bingo's mod panel", () => {
    expect(allowed("/b/b1/mod")).toEqual(["admin", "mod"]);
  });

  it("follows the draft room's rule for the stage", () => {
    expect(allowed("/b/b1/draft")).toEqual(["admin", "mod", "captain", "member", "signedUp"]);
    bingoIn("captains");
    expect(allowed("/b/b1/draft")).toEqual(["admin", "mod", "captain", "member", "signedUp"]);
    bingoIn("signup");
    expect(allowed("/b/b1/draft")).toEqual(["admin", "mod", "captain"]);
  });

  it("shows stats to a team's players only once the bingo is live", () => {
    expect(allowed("/b/b1/stats")).toEqual(["admin", "mod"]);
    bingoIn("live");
    expect(allowed("/b/b1/stats")).toEqual(["admin", "mod", "captain", "member"]);
  });

  it("turns away players outside the clan server from every bingo page, and lets anyone in elsewhere", () => {
    expect(allowed("/b/b1")).toEqual(["admin", "mod", "captain", "member", "signedUp", "stranger"]);
    expect(allowed("/")).toHaveLength(7);
    expect(allowed("/b/no-such-bingo")).toHaveLength(7);
  });

  it("keeps a Planning bingo to its mods", () => {
    bingoIn("planning");
    expect(allowed("/b/b1")).toEqual(["admin", "mod"]);
    expect(allowed("/b/b1/draft")).toEqual(["admin", "mod"]);
  });

  it("says who each user is in the page's bingo", () => {
    const roles = who("/b/b1");
    expect(roles.admin.role).toBe("Site admin");
    expect(roles.mod.role).toBe("Mod");
    expect(roles.captain.role).toBe("Captain · Team A");
    expect(roles.member.role).toBe("Team A");
    expect(roles.signedUp.role).toBe("Signed up");
    expect(roles.stranger.role).toBeNull();
    expect(roles.outsider.role).toBe("Signed up · Not in the clan server");
  });

  it("ranks each user by their highest part in the page's bingo", () => {
    const bingo = db.select().from(schema.bingos).get()!;
    const staff = user("staff");
    db.insert(schema.bingoStaff).values({ bingoId: bingo.id, userId: staff.id }).run();
    const coCaptain = user("coCaptain");
    const team = db.select().from(schema.teams).get()!;
    db.insert(schema.signups).values({ bingoId: bingo.id, userId: coCaptain.id, rsn: "coCaptain" }).run();
    db.insert(schema.teamMembers).values({ teamId: team.id, userId: coCaptain.id, isCoCaptain: true }).run();
    // A Mod who captains a Team ranks as a Mod.
    db.insert(schema.bingoModerators).values({ bingoId: bingo.id, userId: people.captain.id }).run();
    bingoIn("live");
    const access = devPageAccess(db, "/b/b1", [...Object.values(people), staff, coCaptain]);
    const rank = (u: SessionUser) => access.get(u.id)!.rank;
    expect(rank(people.admin)).toBe(DEV_RANK.admin);
    expect(rank(people.mod)).toBe(DEV_RANK.mod);
    expect(rank(people.captain)).toBe(DEV_RANK.mod);
    expect(rank(staff)).toBe(DEV_RANK.staff);
    expect(rank(coCaptain)).toBe(DEV_RANK.captain);
    expect(rank(people.member)).toBe(DEV_RANK.player);
    expect(rank(people.signedUp)).toBe(DEV_RANK.cut);
    expect(rank(people.stranger)).toBe(DEV_RANK.other);
  });

  it("ranks a signup that isn't on a Team as Signed up before the board's revealed", () => {
    expect(who("/b/b1").signedUp.rank).toBe(DEV_RANK.signedUp);
    expect(who("/b/b1").captain.rank).toBe(DEV_RANK.captain);
  });

  it("puts Site admins first off a bingo's pages, and everyone else after", () => {
    for (const path of ["/admin", "/bingos", "/b/no-such-bingo"]) {
      const ranks = who(path);
      expect(ranks.admin.rank).toBe(DEV_RANK.admin);
      expect(new Set(Object.entries(ranks).filter(([k]) => k !== "admin").map(([, a]) => a.rank))).toEqual(new Set([DEV_RANK.other]));
    }
  });
});
