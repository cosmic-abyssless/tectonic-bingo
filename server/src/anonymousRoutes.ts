// The routes where a Player answers a Feedback form (docs/adr/0002-anonymous-feedback.md). A Feedback response is
// anonymous to everyone, so nothing about these requests may say who made them: no request log line carries the user id,
// no error report is tagged with it, and the audit context holds no actor. The routes themselves are marked auditSkip
// (routes/bingos.ts), so the audit log records nothing either, not even that "someone" answered.

const ANONYMOUS_PATH = /^\/api\/bingos\/[^/]+\/feedback(\/.*)?$/;

/** Whether a request to this URL (query string and all) is one that must stay anonymous. */
export function isAnonymousRoute(url: string): boolean {
  const q = url.indexOf("?");
  return ANONYMOUS_PATH.test(q === -1 ? url : url.slice(0, q));
}
