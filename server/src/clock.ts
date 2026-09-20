import { getAuditContext } from "./audit/context";

/**
 * The current time for this request: the dev-only X-Dev-Now override when one is set (see
 * audit/middleware.ts), else the real clock. Services use this instead of `new Date()` so the dev test-data
 * generator can play a bingo forward through the real endpoints at realistic, spoofed times.
 */
export function now(): Date {
  return getAuditContext()?.now ?? new Date();
}
