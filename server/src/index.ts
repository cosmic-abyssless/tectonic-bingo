// Must be the first import — see env.ts for why a plain dotenv.config() call
// positioned before these other imports does not actually run first.
import { isDevModeActive } from "./devMode";
import "./env";
import "./instrument";
import * as Sentry from "@sentry/node";
import path from "path";
import fs from "fs";
import http from "http";
import compression from "compression";
import express from "express";
import session from "express-session";
import createSqliteStoreFactory from "better-sqlite3-session-store";
import cors from "cors";
import passport from "passport";
import { configurePassport } from "./auth/discord";
import authRouter from "./routes/auth";
import devRouter from "./routes/dev";
import meRouter from "./routes/me";
import bingosRouter from "./routes/bingos";
import modRouter from "./routes/mod";
import adminRouter from "./routes/admin";
import siteAdminRouter from "./routes/siteAdmin";
import osrsItemsRouter from "./routes/osrsItems";
import bugReportsRouter from "./routes/bugReports";
import { errorHandler } from "./middleware/errorHandler";
import { requireGuildMember } from "./middleware/requireGuildMember";
import { auditContext } from "./audit/middleware";
import { closeWebSocketServer, initWebSocketServer } from "./ws";
import { DB_PATH, sqlite } from "./db";
import { UPLOADS_DIR, WIKI_ICONS_DIR, getAdminDiscordIds, sessionCookieSecure } from "./config";
import { warmOcr } from "./ocr";
import { shouldWarmOcr } from "./ocrConfig";
import { serveImageVariants } from "./middleware/imageVariants";
import { serveWikiIcons } from "./middleware/wikiIcons";
import { getKnownItemNames } from "./services/itemNames";
import { isOsrsItemSearchEnabled } from "./routes/osrsItems";
import { uploadsStaticOptions } from "./middleware/staticCaching";
import { mountClientApp } from "./middleware/clientApp";
import { readRuntimeConfig } from "./runtimeConfig";
import { getTectonicConfig } from "./services/tectonicService";
import { installProcessLogHandlers, log, requestLog } from "./log";
import clientErrorsRouter from "./routes/clientErrors";
import { shouldReportError } from "./errorReporting";

const REQUIRED_ENV = [
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_CALLBACK_URL",
  "DISCORD_GUILD_ID",
  "SESSION_SECRET",
  "CLIENT_URL",
] as const;

const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  log.error("missing required env", { keys: missing });
  process.exit(1);
}

if (getAdminDiscordIds().length === 0) {
  log.warn("ADMIN_DISCORD_IDS is not set — no user will bootstrap as a site admin");
}

installProcessLogHandlers();

const app = express();
const PORT = process.env.PORT ?? 3001;

// Railway (and most PaaS hosts) terminate TLS at a reverse proxy and forward
// plain HTTP internally — without this, req.secure is always false behind
// that proxy, which silently breaks the `cookie.secure: true` session below
// in production (the browser never gets the session cookie). Harmless in
// dev, where there's no proxy in front and this is a no-op.
app.set("trust proxy", 1);

// Unauthenticated, no session, no SPA. Must be registered before static
// files and the index.html fallback — otherwise GET /health is the React
// app, which client-navigates to `/`. Railway healthcheck path: `/health`.
function health(_req: express.Request, res: express.Response): void {
  try {
    sqlite.prepare("SELECT 1").get();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true });
  } catch {
    res.status(503).setHeader("Cache-Control", "no-store").json({ ok: false });
  }
}
app.get("/health", health);
app.get("/api/health", health);

// CORS - allow requests from the React client. Only matters when the client
// is served from a different origin than this API (local dev, where Vite
// runs on its own port) — a same-origin production deploy (see the static
// serving below) never sends a cross-origin request here at all, so this is
// effectively inert there, not something to strip out for that case.
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

// Default 100kb is too small for a bingo board import/export document — a
// board with many tiles and deep requirement trees can run several MB of
// JSON (see POST /api/admin/bingos/import).
app.use(express.json({ limit: "50mb" }));

// gzip/deflate for API JSON (the board is ~175 KB raw, ~18 KB compressed). The
// default filter skips already-compressed types, so images pass through.
app.use(compression());

// Session middleware — backed by SQLite so sessions survive a server restart
// (the express-session default MemoryStore does not).
const SqliteStore = createSqliteStoreFactory(session);
type SessionStoreWithCleanup = InstanceType<typeof SqliteStore> & {
  startInterval: () => void;
  clearExpiredSessions: () => void;
  _sessionCleanup?: NodeJS.Timeout;
};
// The store's setInterval is not unref'd (and `expired.clear: false` is
// ignored — the library does `clear || true`). Replace it so drain can exit.
(SqliteStore.prototype as SessionStoreWithCleanup).startInterval = function (this: SessionStoreWithCleanup) {
  const id = setInterval(() => this.clearExpiredSessions(), 15 * 60 * 1000);
  id.unref();
  this._sessionCleanup = id;
};
const sessionStore = new SqliteStore({ client: sqlite }) as SessionStoreWithCleanup;
app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: sessionCookieSecure(),
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

// Passport
configurePassport();
app.use(passport.initialize());
app.use(passport.session());
// Which account hit an error, by internal id only (no name or Discord details).
app.use((req, _res, next) => {
  if (req.user) Sentry.setUser({ id: req.user.id });
  next();
});

// Opens the per-request audit actor/requestId context — must run after
// passport.session() (needs req.user) and before the routers.
app.use(auditContext);
app.use(requestLog);

// Uploads — serve screenshots and tile images stored locally.
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use("/uploads", serveImageVariants(UPLOADS_DIR), express.static(UPLOADS_DIR, uploadsStaticOptions));

// OSRS wiki item icons, fetched once and served from disk (players never hit the
// wiki). Public reference data, so it lives outside /api and is cached publicly.
app.use(
  "/wiki-icons",
  serveWikiIcons({ dir: WIKI_ICONS_DIR, isKnownName: (name) => getKnownItemNames().has(name), enabled: isOsrsItemSearchEnabled }),
);

// Routes
app.use("/auth", authRouter);
app.use("/api/me", meRouter);
app.use("/api/admin", siteAdminRouter);
app.use("/api/bingos", requireGuildMember, bingosRouter);
app.use("/api/bingos/:slug/mod", requireGuildMember, modRouter);
app.use("/api/bingos/:slug/admin", requireGuildMember, adminRouter);
app.use("/api/osrs-items", osrsItemsRouter);
// Dev-only tooling (test data generator): only exists while dev mode is on.
if (isDevModeActive()) app.use("/api/dev", devRouter);
app.use("/api/bug-reports", bugReportsRouter);
app.use("/api/client-errors", clientErrorsRouter);

// Serve the built client (client/dist) so the whole site — API, WS, and
// frontend — comes from one origin in production: no CORS, no cookie-domain
// mismatch, and the client's already-relative fetch/WS URLs (see
// WebSocketContext.tsx's `window.location.host`) just work unmodified.
// The built client, when there is one (see mountClientApp; in dev the client is served by Vite instead).
mountClientApp(app, path.join(__dirname, "../../client/dist"), readRuntimeConfig());

// After every route, before our own handler: reports unexpected errors (not deliberate 4xx refusals) to Sentry.
Sentry.setupExpressErrorHandler(app, { shouldHandleError: shouldReportError });
app.use(errorHandler);

const server = http.createServer(app);
initWebSocketServer(server);

server.listen(PORT, () => {
  log.info("server listening", {
    port: Number(PORT),
    nodeEnv: process.env.NODE_ENV ?? "<unset>",
    tectonic: Boolean(getTectonicConfig()),
    ocr: process.env.SCREENSHOT_OCR_DISABLED !== "true",
    dbDir: path.dirname(DB_PATH),
    devMode: isDevModeActive(),
  });
  // After the server is up and taking requests, so a slow model download never delays a deploy going healthy.
  if (shouldWarmOcr()) void warmOcr();
});

// SQLite cannot be shared by overlapping replicas. On SIGTERM (Railway
// replace), drain HTTP, drop WS clients, close the DB, then exit so the
// new replica can take the volume. Force-exit inside Railway's ~10s grace.
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("shutdown", { signal });
  closeWebSocketServer();
  if (sessionStore._sessionCleanup) clearInterval(sessionStore._sessionCleanup);
  server.close(() => {
    // Give Sentry a moment to send anything still buffered (a no-op when it is switched off).
    void Sentry.close(2000).finally(() => {
      sqlite.close();
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
