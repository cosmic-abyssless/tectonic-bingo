import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { bingos } from "../db/schema";
import { log } from "../log";
import { bingoRolesOfEveryone, changedRoleHolders } from "../services/permissions";
import { broadcast } from "../ws";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// The writes under /api/bingos/:slug that can change anyone's roles there: the ones that write what bingoRolesOfEveryone
// reads. That's the Moderators and Staff, the Teams with their members, Captains and co-captains, the active Signups,
// and in the Draft stage who is Cut, which follows the accepted pairs, the picks, the Team count and the cut mode. As
// [method, path under the bingo]: "*" is any write, ":x" any one segment, and a trailing "/**" the path and everything
// under it. Everything else (submissions and their reviews, reactions, tile interest, ratings, buy-ins, votes,
// Feedback, the board, Restrictions, which tell their user themselves) skips the before and after scans. A new route
// that writes any of these belongs here: broadcastAccessChanges.test.ts fails until it is classified.
const ROLE_CHANGING_ROUTES: readonly (readonly [method: string, path: string])[] = [
  // A Signup made, edited or withdrawn; a pair asked for, answered or broken up.
  ["*", "/signup/**"],
  ["POST", "/draft/pick"],
  ["POST", "/draft/undo"],
  ["POST", "/mod/stage"],
  ["*", "/mod/pairings/**"],
  ["DELETE", "/mod/signups/:id"],
  // The cut mode, which decides who is Cut.
  ["PATCH", "/admin/settings"],
  ["*", "/admin/mods/**"],
  ["*", "/admin/staff/**"],
  ["POST", "/admin/teams"],
  ["DELETE", "/admin/teams/:id"],
  ["*", "/admin/teams/:id/members/**"],
  ["POST", "/admin/late-signups"],
  ["POST", "/admin/cut-review/apply"],
];

const ROLE_CHANGING_PATTERNS = ROLE_CHANGING_ROUTES.map(([method, path]) => {
  const segments = path.split("/").filter(Boolean);
  const subtree = segments[segments.length - 1] === "**";
  return { method, segments: subtree ? segments.slice(0, -1) : segments, subtree };
});

/** A path's segments as Express routes it, decoded and lower-cased (routing ignores case); a bad escape is kept as is. */
function pathSegments(url: string): string[] {
  const path = url.split(/[?#]/, 1)[0]!.replace(/^[a-z][a-z\d+.-]*:\/\/[^/]*/i, "");
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment).toLowerCase();
      } catch {
        return segment.toLowerCase();
      }
    });
}

/**
 * Whether a `method` request to `url` (req.originalUrl: /api/bingos/:slug/..., with any query string) may change
 * someone's roles in the bingo, by ROLE_CHANGING_ROUTES. A read never does. A url that isn't under /api/bingos/:slug
 * isn't known, so it may.
 */
export function mayChangeRoles(method: string, url: string): boolean {
  const verb = method.toUpperCase();
  if (READ_METHODS.has(verb)) return false;
  const segments = pathSegments(url);
  if (segments[0] !== "api" || segments[1] !== "bingos" || segments.length < 3) return true;
  const rest = segments.slice(3);
  return ROLE_CHANGING_PATTERNS.some(
    (p) =>
      (p.method === "*" || p.method === verb) &&
      (p.subtree ? rest.length >= p.segments.length : rest.length === p.segments.length) &&
      p.segments.every((s, i) => s.startsWith(":") || s === rest[i]),
  );
}

// Mount on /api/bingos/:slug, ahead of its routers. A write that changes anyone's roles in the bingo (a Moderator added
// or removed, a Captain replaced, a Team member drafted, added or removed, a Signup made or withdrawn, a Team deleted,
// the stage moved on) tells those users with access_changed, and their clients refetch their permissions. Worked out by
// comparing everyone's roles before and after the write, so no route has to remember to, and one that changes roles in
// a way nobody listed still tells them. Only for the routes that can (mayChangeRoles): the scans cost a few queries
// each, and in the Draft stage a build of the draft state. A site admin's flag is site-wide: PATCH
// /api/admin/users/:id sends its own.
export function broadcastAccessChanges(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || !mayChangeRoles(req.method, req.originalUrl)) {
    next();
    return;
  }
  const bingo = db.select().from(bingos).where(eq(bingos.slug, req.params.slug as string)).get();
  if (!bingo) {
    next();
    return;
  }
  const before = bingoRolesOfEveryone(db, bingo);
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    try {
      // Fresh: the write may have moved the stage on, or deleted the bingo (nothing to tell then).
      const after = db.select().from(bingos).where(eq(bingos.id, bingo.id)).get();
      if (!after) return;
      const userIds = changedRoleHolders(before, bingoRolesOfEveryone(db, after));
      if (userIds.length > 0) broadcast({ type: "access_changed", bingoId: bingo.id, payload: { userIds } });
    } catch (err) {
      log.warn("access change check failed", { err, bingoId: bingo.id });
    }
  });
  next();
}
