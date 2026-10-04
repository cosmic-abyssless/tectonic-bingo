import { changedNothing } from "./audit/record";
import { broadcast } from "./ws";

/**
 * broadcast() for a route: tells the open pages what the request changed, unless it changed nothing (#456,
 * docs/postmortems/2026-10-03-colour-picker.md), so a save of an untouched form sends nothing. The admin router decides
 * the same once, in its finish hook.
 */
export function broadcastChange(...args: Parameters<typeof broadcast>): void {
  if (!changedNothing()) broadcast(...args);
}
