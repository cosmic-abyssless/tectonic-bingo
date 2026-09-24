import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingoModerators, signups, teamMembers, teams } from "../db/schema";
import type { SessionUser } from "../types";
import { getBingoBySlug } from "./bingoService";
import { canViewDraftRoom } from "./draftService";

type Db = BetterSQLite3Database<typeof schema>;

export interface DevPageAccess {
  /** Whether this user could open the page (the same rules the routes behind it apply). */
  access: boolean;
  /** Who they are in the page's bingo, for picking one: "Mod", "Captain · Team A", "Signed up"… Null outside a bingo. */
  role: string | null;
}

/**
 * For the dev account switcher: which of `users` could open the client page at `path`, and their part in its bingo.
 * Mirrors the gates the page's API calls hit: requireAdmin (/admin), requireGuildMember (every bingo route), the mod
 * routes' requireBingoMod, the stats route's stage/team rule, and draftService.canViewDraftRoom. Dev mode only.
 */
export function devPageAccess(db: Db, path: string, users: SessionUser[]): Map<string, DevPageAccess> {
  const result = new Map<string, DevPageAccess>();
  const admin = (u: SessionUser) => (u.isAdmin ? "Site admin" : null);

  if (path === "/admin" || path.startsWith("/admin/")) {
    for (const u of users) result.set(u.id, { access: u.isAdmin, role: admin(u) });
    return result;
  }

  const match = path.match(/^\/b\/([^/?#]+)(?:\/([^/?#]+))?/);
  const bingo = match ? getBingoBySlug(db, decodeURIComponent(match[1]!)) : null;
  if (!match || !bingo) {
    for (const u of users) result.set(u.id, { access: true, role: admin(u) });
    return result;
  }
  const page = match[2] ?? "";

  const mods = new Set(db.select({ userId: bingoModerators.userId }).from(bingoModerators).where(eq(bingoModerators.bingoId, bingo.id)).all().map((r) => r.userId));
  const signedUp = new Set(db.select({ userId: signups.userId }).from(signups).where(eq(signups.bingoId, bingo.id)).all().map((r) => r.userId));
  const membership = new Map(
    db
      .select({ userId: teamMembers.userId, team: teams.name, lead: teamMembers.isCaptain, coLead: teamMembers.isCoCaptain })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teams.bingoId, bingo.id))
      .all()
      .map((r) => [r.userId, { team: r.team, isLead: r.lead || r.coLead, coLead: r.coLead }]),
  );

  for (const u of users) {
    const isMod = u.isAdmin || mods.has(u.id);
    const team = membership.get(u.id);
    const isSignedUp = signedUp.has(u.id);
    // Bingo routes turn away anyone whose last Discord login showed them outside the clan server (site admins aside).
    const inClan = u.inGuild || u.isAdmin;
    let access: boolean;
    if (page === "mod") access = inClan && isMod;
    else if (page === "stats") access = inClan && (isMod || bingo.stage === "complete" || (bingo.stage === "live" && !!team));
    else if (page === "draft") access = inClan && canViewDraftRoom(bingo.stage, { isMod, isLead: !!team?.isLead, isOnTeam: !!team, isSignedUp });
    else access = inClan;

    const parts = [u.isAdmin ? "Site admin" : mods.has(u.id) ? "Mod" : null];
    if (team) parts.push(team.isLead ? `${team.coLead ? "Co-captain" : "Captain"} · ${team.team}` : team.team);
    else if (isSignedUp) parts.push("Signed up");
    if (!inClan) parts.push("Not in the clan server");
    const role = parts.filter(Boolean).join(" · ") || null;
    result.set(u.id, { access, role });
  }
  return result;
}
