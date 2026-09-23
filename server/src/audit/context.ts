// Request-scoped actor/requestId context, threaded via AsyncLocalStorage so
// deep service-layer code can call audit() without every function in the
// call chain taking actor/requestId params. See docs/audit-log-plan.md.
import { AsyncLocalStorage } from "node:async_hooks";
import type { AuditActorRole, AuditActorType } from "@bingo/shared";

export interface AuditContext {
  requestId: string;
  actorUserId: string | null;
  actorType: AuditActorType;
  actorRole: AuditActorRole;
  /** How many rows this request has already recorded — read by the http.mutation fallback. */
  recorded: number;
  /** Set via auditSkip() to suppress the fallback for a route that intentionally records nothing. */
  skip: string | null;
  /** Dev only: the request's clock, from the X-Dev-Now header (see clock.ts). Absent outside dev mode. */
  now?: Date;
  /**
   * Dev only: the request asked (X-Dev-Skip-Integrations) to stay away from the outside services, so the clan API
   * client reads as not configured (tectonicService) and no player stats are fetched (playerStatsService). How the
   * test data generator's made-up players keep off the real APIs. Absent outside dev mode.
   */
  skipIntegrations?: boolean;
}

/** Whether this request asked to skip the outside services (see AuditContext.skipIntegrations). */
export function skipsIntegrations(): boolean {
  return getAuditContext()?.skipIntegrations === true;
}

const storage = new AsyncLocalStorage<AuditContext>();

export function runWithAuditContext<T>(ctx: AuditContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getAuditContext(): AuditContext | undefined {
  return storage.getStore();
}
