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
}

const storage = new AsyncLocalStorage<AuditContext>();

export function runWithAuditContext<T>(ctx: AuditContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getAuditContext(): AuditContext | undefined {
  return storage.getStore();
}
