import { reportClientError } from "../core/logging/reportClientError";
import { noteServerBuild } from "./serverBuild";

export class ApiError extends Error {
  status: number;
  // The server's stable error code, when it sends one (e.g. "cut_review_required" on the move into the Draft) — for
  // branching on without parsing the message.
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ApiError";
  }
}

// The device's IANA zone, sent on every request (Achievements' "device clock" rule — CONTEXT.md "Achievement",
// server/src/audit/context.ts getTimezone). Never blocks a request: an unresolvable zone just falls back server-side.
function clientTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

type RefusalListener = (path: string, method: string, error: ApiError) => void;
const refusalListeners = new Set<RefusalListener>();

/**
 * Hears every 403 the server answers, whoever made the request: the page may be stale, so the viewer's permissions are
 * asked again (headless/permissions.ts useAccessWatch). Returns the unsubscribe.
 */
export function onRefused(listener: RefusalListener): () => void {
  refusalListeners.add(listener);
  return () => refusalListeners.delete(listener);
}

type SlowDownListener = (error: ApiError) => void;
const slowDownListeners = new Set<SlowDownListener>();

/**
 * Hears every 429: the server's per-user write limit refused a write ("Slow down: …"), so the page shows its message
 * (App's SlowDownNotice). Nothing retries it. Returns the unsubscribe.
 */
export function onSlowDown(listener: SlowDownListener): () => void {
  slowDownListeners.add(listener);
  return () => slowDownListeners.delete(listener);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    // Merged so init's own headers (jsonInit's Content-Type, or postForm's none) still win on conflicts — this
    // only adds the timezone alongside them.
    res = await fetch(path, { credentials: "include", ...init, headers: { "X-Client-Timezone": clientTimezone(), ...init?.headers } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "network error";
    reportClientError(`${path} ${message}`, "api.network");
    throw err;
  }
  const buildId = res.headers.get("X-Build-Id");
  if (buildId) noteServerBuild({ buildId, forceReload: res.headers.get("X-Force-Reload") === "1" });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let code: string | undefined;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
      if (typeof data?.code === "string") code = data.code;
    } catch {
      // response body wasn't JSON — keep the generic message
    }
    if (res.status >= 500) reportClientError(`${path} ${message}`, "api.5xx");
    const error = new ApiError(res.status, message, code);
    if (res.status === 403) for (const listener of refusalListeners) listener(path, init?.method ?? "GET", error);
    if (res.status === 429) for (const listener of slowDownListeners) listener(error);
    throw error;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, jsonInit("POST", body)),
  patch: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, jsonInit("PATCH", body)),
  put: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, jsonInit("PUT", body)),
  delete: <T = void>(path: string, body?: unknown): Promise<T> => request<T>(path, body === undefined ? { method: "DELETE" } : jsonInit("DELETE", body)),
  postForm: <T>(path: string, formData: FormData): Promise<T> => request<T>(path, { method: "POST", body: formData }),
};
