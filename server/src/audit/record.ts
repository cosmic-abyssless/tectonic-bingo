// The single write path onto audit_log. Called from inside service
// functions, inside the caller's own transaction, so an audit row is atomic
// with the mutation it describes. See docs/audit-log-plan.md.
import { AUDIT_ACTIONS, type AuditAction, type AuditActorRole, type AuditActorType, type AuditDetailsMap, type AuditEntityType, type AuditVisibility, type FieldChanges } from "@bingo/shared";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { auditLog } from "../db/schema";
import { broadcast } from "../ws";
import { getAuditContext, type AuditContext } from "./context";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

export interface AuditInput<A extends AuditAction> {
  action: A;
  /** null = site-level entry, survives bingo deletion. */
  bingoId: string | null;
  entity: { type: AuditEntityType; id: string | null; label?: string | null };
  details: AuditDetailsMap[A];
  teamId?: string | null;
  /** Defaults to the action's registry default. */
  visibility?: AuditVisibility;
  /** Explicit actor wins over the ambient request context; omit both to fall back to "system". */
  actor?: "system" | { userId: string | null; type?: AuditActorType; role?: AuditActorRole };
  onBehalfOfUserId?: string | null;
  /** Override the timestamp — mirrors advanceStage's `now` param, for deterministic tests. */
  now?: Date;
}

const DETAILS_MAX_BYTES = 8000;
const SECRET_KEY_PATTERN = /code|secret|token|password|verification/i;

function resolveActor(
  actorInput: AuditInput<AuditAction>["actor"],
  ctx: AuditContext | undefined,
): { userId: string | null; type: AuditActorType; role: AuditActorRole } {
  if (actorInput === "system") return { userId: null, type: "system", role: "system" };
  if (actorInput) {
    return { userId: actorInput.userId, type: actorInput.type ?? "user", role: actorInput.role ?? ctx?.actorRole ?? "player" };
  }
  if (ctx) return { userId: ctx.actorUserId, type: ctx.actorType, role: ctx.actorRole };
  return { userId: null, type: "system", role: "system" };
}

/** Inserts one row, bumps the request's recorded count, and broadcasts to connected clients. Returns the new row's id. */
export function audit<A extends AuditAction>(db: Queryable, input: AuditInput<A>): number {
  const ctx = getAuditContext();
  const actor = resolveActor(input.actor, ctx);
  const visibility = input.visibility ?? AUDIT_ACTIONS[input.action].visibility;

  let detailsJson = JSON.stringify(input.details ?? {});
  if (detailsJson.length > DETAILS_MAX_BYTES) {
    detailsJson = JSON.stringify({ truncated: true, note: "details exceeded the 8KB cap" });
  }

  const row = db
    .insert(auditLog)
    .values({
      bingoId: input.bingoId,
      requestId: ctx?.requestId ?? null,
      action: input.action,
      visibility,
      actorType: actor.type,
      actorRole: actor.role,
      actorUserId: actor.userId,
      onBehalfOfUserId: input.onBehalfOfUserId ?? null,
      entityType: input.entity.type,
      entityId: input.entity.id,
      entityLabel: input.entity.label ?? null,
      teamId: input.teamId ?? null,
      details: detailsJson,
      createdAt: input.now ?? new Date(),
    })
    .returning({ id: auditLog.id })
    .get();

  if (ctx) ctx.recorded++;
  // Safe to broadcast before the enclosing transaction (if any) commits:
  // better-sqlite3 is synchronous and single-process, so no client can race
  // in and refetch before COMMIT actually runs. A later rollback just causes
  // one harmless spurious refetch.
  if (input.bingoId) {
    broadcast({ type: "audit_appended", bingoId: input.bingoId, payload: { teamId: input.teamId ?? null, visibility } });
  }
  return row.id;
}

/** Records that a mutation was considered and deliberately produced no change (e.g. an empty patch), so the http.mutation fallback doesn't fire for it. */
export function markAuditedNoop(): void {
  const ctx = getAuditContext();
  if (ctx) ctx.recorded++;
}

/**
 * Changed-fields-only diff. Dates are normalized to ISO strings so the
 * output matches the string-typed fields in AuditDetailsMap. Returns null
 * when nothing in scope changed (callers should call markAuditedNoop() in
 * that case instead of skipping audit() entirely).
 */
export function diffFields<T extends object>(
  before: T,
  after: T,
  opts: { only?: (keyof T)[]; exclude?: (keyof T)[]; redact?: (keyof T)[] } = {},
): FieldChanges<Record<string, unknown>> | null {
  const normalize = (v: unknown) => (v instanceof Date ? v.toISOString() : v);
  const beforeRec = before as Record<string, unknown>;
  const afterRec = after as Record<string, unknown>;
  const keys = (opts.only ?? (Object.keys(after) as (keyof T)[])).filter((k) => !opts.exclude?.includes(k));

  const beforeOut: Record<string, unknown> = {};
  const afterOut: Record<string, unknown> = {};
  let changed = false;
  for (const key of keys) {
    const beforeVal = normalize(beforeRec[key as string]);
    const afterVal = normalize(afterRec[key as string]);
    if (JSON.stringify(beforeVal) === JSON.stringify(afterVal)) continue;
    changed = true;
    const redacted = opts.redact?.includes(key);
    beforeOut[key as string] = redacted ? "[redacted]" : beforeVal;
    afterOut[key as string] = redacted ? "[redacted]" : afterVal;
  }
  return changed ? { before: beforeOut, after: afterOut } : null;
}

/** Strips likely-secret keys and caps size before a request body is ever persisted (used by the http.mutation fallback). */
export function redactBody(body: unknown, maxBytes = 4000): unknown {
  const scrub = (val: unknown): unknown => {
    if (Array.isArray(val)) return val.map(scrub);
    if (val && typeof val === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(val as Record<string, unknown>)) {
        out[key] = SECRET_KEY_PATTERN.test(key) ? "[redacted]" : scrub(value);
      }
      return out;
    }
    return val;
  };
  const scrubbed = scrub(body);
  const json = JSON.stringify(scrubbed);
  if (json.length <= maxBytes) return scrubbed;
  return { truncated: true, preview: json.slice(0, maxBytes) };
}
