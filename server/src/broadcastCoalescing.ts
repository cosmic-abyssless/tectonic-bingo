import type { BroadcastEvent } from "@bingo/shared";

// A burst of writes must not become a burst of refetches on every open page (docs/postmortems/2026-10-03-colour-picker.md):
// the first event of a type for a Bingo goes out at once, so a single change feels as quick as ever, and the rest of
// that type for that Bingo within the window are held and go out as one at its end.

/** How long a type's events for one Bingo are held after one has been sent. */
export const COALESCE_WINDOW_MS = 500;

/** An event on its way out: `to` limits it to these users' sockets (absent: everyone watching its Bingo). */
export interface Outgoing {
  event: BroadcastEvent;
  to?: readonly string[];
}

type EventOf<T extends BroadcastEvent["type"]> = Extract<BroadcastEvent, { type: T }>;

/**
 * How one event type is held. "each": its payload is data a listener uses (a Draft pick's reveal, a stage's toast), so
 * every one is sent as it comes. Otherwise the client only refetches, and held events collapse into one:
 * - `key` splits them where the payload decides who must hear it (by default one per Bingo);
 * - `merge` folds a held event into the next (by default the next wins: its payload is the latest state, or nothing any
 *   client reads);
 * - `each` picks out the events of the type that carry data after all.
 */
type Rule<E> = "each" | { key?: (event: E) => string; merge?: (held: E, next: E) => E; each?: (event: E) => boolean };

const union = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])];

/** Every event type's Rule; a new type has to be given one. */
export const COALESCE_RULES: { [T in BroadcastEvent["type"]]: Rule<EventOf<T>> } = {
  submission_created: {},
  // nodeIds is the union, so it names every node reviewed in the window.
  submission_reviewed: { merge: (held, next) => ({ ...next, payload: { ...next.payload, nodeIds: union(held.payload.nodeIds, next.payload.nodeIds) } }) },
  gp_values_updated: {},
  // The toast names the stage.
  stage_changed: "each",
  wrapped_published: {},
  draft_started: {},
  draft_order_shuffled: {},
  draft_order_set: {},
  // The reveal plays each pick, and an undone pick takes back its own.
  draft_pick: "each",
  draft_pick_undone: "each",
  // Sent only to the Team's leads, so one Team's are never folded into another's.
  draft_rating_changed: { key: (event) => event.payload.teamId },
  tile_interest_changed: {},
  submission_reactions_changed: {},
  team_updated: {},
  // A stats refresh starting or ending shows on that signup's row.
  signup_changed: { each: (event) => event.payload.statsRefreshing !== undefined },
  bingo_changed: {},
  mods_changed: {},
  questions_changed: {},
  superlative_categories_changed: {},
  wrapped_art_changed: {},
  audit_appended: {},
  // Site-wide: never held.
  bug_report_changed: "each",
  // Only the user named refetches their Achievements.
  achievements_changed: { key: (event) => event.payload.userId },
  superlative_votes_changed: {},
  // Only the users named refetch their permissions, so it names everyone held. (bingoId null is site-wide: never held.)
  access_changed: { merge: (held, next) => ({ ...next, payload: { userIds: union(held.payload.userIds, next.payload.userIds) } }) },
  restrictions_changed: {},
  player_renamed: {},
};

/** The window an event is held in, or null if it's sent as it comes (a site-wide event, or an "each" one). */
function windowKey(event: BroadcastEvent): string | null {
  const bingoId = "bingoId" in event ? event.bingoId : null;
  if (!bingoId) return null;
  const rule = COALESCE_RULES[event.type] as Rule<BroadcastEvent>;
  if (rule === "each" || rule.each?.(event)) return null;
  return `${bingoId}\u0000${event.type}\u0000${rule.key?.(event) ?? ""}`;
}

function mergeOutgoing(held: Outgoing, next: Outgoing): Outgoing {
  const rule = COALESCE_RULES[next.event.type] as Exclude<Rule<BroadcastEvent>, "each">;
  const event = rule.merge ? rule.merge(held.event, next.event) : next.event;
  // Everyone either of them was for (anyone's, if either was for everyone).
  return held.to && next.to ? { event, to: union(held.to, next.to) } : { event };
}

export interface Coalescer {
  push(out: Outgoing): void;
  /** Drops whatever is held (the socket server is closing). */
  clear(): void;
}

/** Leading-edge plus trailing throttle per window key: `send` gets the first at once and the held rest as one per window. */
export function createCoalescer(send: (out: Outgoing) => void, windowMs = COALESCE_WINDOW_MS): Coalescer {
  const windows = new Map<string, { held: Outgoing | null; timer: ReturnType<typeof setTimeout> }>();

  function open(key: string): void {
    const timer = setTimeout(() => {
      const { held } = windows.get(key)!;
      windows.delete(key);
      if (!held) return;
      send(held);
      // What was held went out just now: the next one waits for the window after it, so a steady stream is one a window.
      open(key);
    }, windowMs);
    timer.unref?.();
    windows.set(key, { held: null, timer });
  }

  return {
    push(out) {
      const key = windowKey(out.event);
      if (key === null) {
        send(out);
        return;
      }
      const window = windows.get(key);
      if (!window) {
        send(out);
        open(key);
        return;
      }
      window.held = window.held ? mergeOutgoing(window.held, out) : out;
    },
    clear() {
      for (const { timer } of windows.values()) clearTimeout(timer);
      windows.clear();
    },
  };
}
