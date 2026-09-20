const MAX_MSG = 500;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

let count = 0;
let resetAt = 0;
let inFlight = false;

export function reportClientError(message: string, source: string): void {
  const now = Date.now();
  if (now >= resetAt) {
    count = 0;
    resetAt = now + WINDOW_MS;
  }
  count += 1;
  if (count > MAX_PER_WINDOW || inFlight) return;

  inFlight = true;
  fetch("/api/client-errors", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: message.slice(0, MAX_MSG),
      source: source.slice(0, 80),
      page: window.location.pathname.slice(0, 200),
    }),
  }).catch(() => {
    // swallow — reporting must never throw back into the app
  }).finally(() => {
    inFlight = false;
  });
}

export function installClientErrorListeners(): void {
  window.addEventListener("error", (event) => {
    const msg = event.error instanceof Error ? event.error.message : event.message;
    if (msg) reportClientError(msg, "window.error");
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason ?? "unhandled rejection");
    reportClientError(msg, "unhandledrejection");
  });
}
