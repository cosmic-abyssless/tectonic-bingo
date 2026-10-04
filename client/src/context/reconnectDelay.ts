// How long the live-events socket (WebSocketContext) waits before trying again after it closes. A deploy closes every
// open tab's socket at once: doubling waits with jitter spread their reconnects (and the refetch each one sets off)
// out, rather than all of them landing on the restarted server in the same second.

const BASE_MS = 2000;
const MAX_MS = 30_000;

/**
 * The wait before reconnect try `attempt` (0 for the first after a close; one more for each try in a row that fails):
 * 2 s doubling per try, capped at 30 s, then anywhere from half to one and a half times that. `random` is in [0, 1).
 */
export function reconnectDelayMs(attempt: number, random: () => number): number {
  const base = Math.min(BASE_MS * 2 ** attempt, MAX_MS);
  return base * (0.5 + random());
}
