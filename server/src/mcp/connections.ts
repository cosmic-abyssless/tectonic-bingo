// Admins' Claude connections to the admin MCP server, for seeing and revoking them (#293). A connection is one
// oauth_tokens row: an Admin's approval of one app, whose access and refresh tokens are replaced together on every
// refresh (oauthProvider.ts). Revoking stamps revoked_at, which both the bearer check and the refresh grant refuse, so
// the next /mcp call gets a 401 and the next refresh invalid_grant.
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { discordName, type McpConnection } from "@bingo/shared";
import * as schema from "../db/schema";
import { oauthClients, oauthTokens, users } from "../db/schema";
import { audit } from "../audit/record";
import { ServiceError } from "../services/errors";
import { now as clockNow } from "../clock";
import { CONNECTION_IDLE_MS } from "./oauthProvider";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

function selectConnections(db: Queryable, now: Date, only: { userId?: string; id?: string } = {}) {
  return db
    .select({ id: oauthTokens.id, createdAt: oauthTokens.createdAt, lastUsedAt: oauthTokens.lastUsedAt, metadataJson: oauthClients.metadataJson, user: {
        id: users.id,
        discordId: users.discordId,
        discordUsername: users.discordUsername,
        discordGlobalName: users.discordGlobalName,
        discordGuildNick: users.discordGuildNick,
        discordAvatar: users.discordAvatar,
      },
    })
    .from(oauthTokens)
    .innerJoin(oauthClients, eq(oauthClients.clientId, oauthTokens.clientId))
    .innerJoin(users, eq(users.id, oauthTokens.userId))
    .where(
      and(
        isNull(oauthTokens.revokedAt),
        gte(oauthTokens.lastUsedAt, new Date(now.getTime() - CONNECTION_IDLE_MS)),
        only.userId ? eq(oauthTokens.userId, only.userId) : undefined,
        only.id ? eq(oauthTokens.id, only.id) : undefined,
      ),
    )
    .orderBy(desc(oauthTokens.lastUsedAt))
    .all();
}

/** The app's registered name and the host its sign-in came back to (its first redirect URI). */
function describeClient(metadataJson: string): { clientName: string; redirectHost: string | null } {
  const meta = JSON.parse(metadataJson) as { client_name?: string; redirect_uris?: string[] };
  let redirectHost: string | null = null;
  try {
    redirectHost = meta.redirect_uris?.[0] ? new URL(meta.redirect_uris[0]).host : null;
  } catch {
    redirectHost = null;
  }
  return { clientName: meta.client_name?.trim() || "An unnamed app", redirectHost };
}

function toConnection(row: ReturnType<typeof selectConnections>[number]): McpConnection {
  return { id: row.id, ...describeClient(row.metadataJson), connectedAt: row.createdAt.toISOString(), lastUsedAt: row.lastUsedAt.toISOString(), user: row.user };
}

/** Live connections, most recently used first: one Admin's, or everyone's when userId is left out. */
export function listConnections(db: Queryable, userId?: string, now: Date = clockNow()): McpConnection[] {
  return selectConnections(db, now, { userId }).map(toConnection);
}

function revokeRow(tx: Tx, row: ReturnType<typeof selectConnections>[number], now: Date, reason: "revoked" | "admin_removed", actorUserId: string | null): void {
  tx.update(oauthTokens).set({ revokedAt: now }).where(eq(oauthTokens.id, row.id)).run();
  const { clientName, redirectHost } = describeClient(row.metadataJson);
  audit(tx, {
    action: "mcp.connection_revoked",
    bingoId: null,
    entity: { type: "mcp_connection", id: row.id, label: clientName },
    details: { clientName, redirectHost, ownerUserId: row.user.id, ownerName: discordName(row.user), byOwner: actorUserId === row.user.id, reason },
  });
}

/**
 * Revokes one live connection. Its own Admin can revoke it; anyone else only as a Site Admin. An unknown, revoked or
 * lapsed connection is a 404 either way, so a plain Admin can't probe for other admins' ids.
 */
export function revokeConnection(db: Db, connectionId: string, actor: { id: string; isSiteAdmin: boolean }, now: Date = clockNow()): void {
  db.transaction((tx) => {
    const [row] = selectConnections(tx, now, { id: connectionId });
    if (!row || (row.user.id !== actor.id && !actor.isSiteAdmin)) throw new ServiceError(404, "Connection not found");
    revokeRow(tx, row, now, "revoked", actor.id);
  });
}

/** Revokes every live connection of an Admin who just lost the role. Call inside the role change's transaction. */
export function revokeAllForUser(tx: Tx, userId: string, actorUserId: string | null, now: Date = clockNow()): number {
  const rows = selectConnections(tx, now, { userId });
  for (const row of rows) revokeRow(tx, row, now, "admin_removed", actorUserId);
  // Lapsed ones too, which aren't listed but still hold a refresh token.
  tx.update(oauthTokens).set({ revokedAt: now }).where(and(eq(oauthTokens.userId, userId), isNull(oauthTokens.revokedAt))).run();
  return rows.length;
}
