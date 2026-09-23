// A tiny HTTP client for a dev-mode server: one session cookie per user (logged in through the dev-only
// /auth/dev-login), and the dev-only headers that make the run realistic (X-Dev-Now spoofs the request's clock,
// X-Dev-Skip-Ocr skips the background screenshot analysis, X-Dev-Skip-Integrations keeps fake players away from the
// clan API and the player stats sites). See docs/generate-bingo-plan.md.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly detail: string,
  ) {
    super(`${method} ${path} -> ${status}: ${detail}`);
  }
}

export interface CallOptions {
  /** The spoofed time of this request (X-Dev-Now). */
  at?: Date;
}

// The placeholder screenshot every submission uploads: a 1x1 PNG (the same bytes as e2e/fixtures/screenshot.png),
// inlined so the generator needs no file from the repo and runs inside the built image too.
const SCREENSHOT = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

export class Api {
  private readonly cookies = new Map<string, string>();

  /**
   * `headers` go on every request: the in-server job sends X-Forwarded-Proto so its loopback requests count as HTTPS
   * (the session cookie is Secure on staging), and the CLI sends a staging password (Authorization) when it has one.
   */
  constructor(
    readonly base: string,
    readonly headers: Record<string, string> = {},
  ) {}

  /** Requests made as `discordId`, logging in the first time. Pass null for an anonymous request. */
  as(discordId: string | null): Session {
    return new Session(this, discordId);
  }

  async cookieFor(discordId: string): Promise<string> {
    const known = this.cookies.get(discordId);
    if (known) return known;
    const res = await fetch(`${this.base}/auth/dev-login`, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ discordId }),
    });
    if (!res.ok) throw new ApiError(res.status, "POST", "/auth/dev-login", await errorText(res));
    const cookie = res.headers.getSetCookie()[0]?.split(";")[0];
    if (!cookie) throw new Error(`dev-login for ${discordId} set no session cookie`);
    this.cookies.set(discordId, cookie);
    return cookie;
  }
}

async function errorText(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { error?: string };
    return json.error ?? text;
  } catch {
    return text.slice(0, 200);
  }
}

export class Session {
  constructor(
    private readonly api: Api,
    private readonly discordId: string | null,
  ) {}

  private async send<T>(method: string, urlPath: string, body: RequestInit["body"], headers: Record<string, string>, opts: CallOptions): Promise<T> {
    const all: Record<string, string> = { ...this.api.headers, "X-Dev-Skip-Ocr": "1", "X-Dev-Skip-Integrations": "1", ...headers };
    if (this.discordId) all.cookie = await this.api.cookieFor(this.discordId);
    if (opts.at) all["X-Dev-Now"] = opts.at.toISOString();
    const res = await fetch(`${this.api.base}${urlPath}`, { method, headers: all, body });
    if (!res.ok) throw new ApiError(res.status, method, urlPath, await errorText(res));
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private json<T>(method: string, urlPath: string, body: unknown, opts: CallOptions): Promise<T> {
    return this.send<T>(method, urlPath, body === undefined ? undefined : JSON.stringify(body), body === undefined ? {} : { "Content-Type": "application/json" }, opts);
  }

  get<T>(urlPath: string, opts: CallOptions = {}): Promise<T> {
    return this.json<T>("GET", urlPath, undefined, opts);
  }
  post<T>(urlPath: string, body?: unknown, opts: CallOptions = {}): Promise<T> {
    return this.json<T>("POST", urlPath, body, opts);
  }
  patch<T>(urlPath: string, body?: unknown, opts: CallOptions = {}): Promise<T> {
    return this.json<T>("PATCH", urlPath, body, opts);
  }
  put<T>(urlPath: string, body?: unknown, opts: CallOptions = {}): Promise<T> {
    return this.json<T>("PUT", urlPath, body, opts);
  }
  delete<T>(urlPath: string, opts: CallOptions = {}): Promise<T> {
    return this.json<T>("DELETE", urlPath, undefined, opts);
  }

  /** A submission: the placeholder screenshot plus its claims, as multipart. */
  submit<T>(urlPath: string, claims: unknown[], opts: CallOptions = {}, forUserId?: string): Promise<T> {
    const form = new FormData();
    form.append("claims", JSON.stringify(claims));
    if (forUserId) form.append("forUserId", forUserId); // posted by this session for a teammate
    form.append("screenshot", new Blob([new Uint8Array(SCREENSHOT)], { type: "image/png" }), "screenshot.png");
    return this.send<T>("POST", urlPath, form, {}, opts);
  }
}
