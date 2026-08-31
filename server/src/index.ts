import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import http from "http";
// Load .env from the monorepo root regardless of which directory npm runs from
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
import express from "express";
import session from "express-session";
import createSqliteStoreFactory from "better-sqlite3-session-store";
import cors from "cors";
import passport from "passport";
import { configurePassport } from "./auth/discord";
import authRouter from "./routes/auth";
import meRouter from "./routes/me";
import bingosRouter from "./routes/bingos";
import modRouter from "./routes/mod";
import adminRouter from "./routes/admin";
import siteAdminRouter from "./routes/siteAdmin";
import { errorHandler } from "./middleware/errorHandler";
import { initWebSocketServer } from "./ws";
import { sqlite } from "./db";
import { getAdminDiscordIds } from "./config";

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
  console.error(
    `\n[ERROR] Missing required environment variables:\n  ${missing.join("\n  ")}\n\nCopy .env.example to .env and fill in the values.\n`
  );
  process.exit(1);
}

if (getAdminDiscordIds().length === 0) {
  console.warn(
    "[WARN] ADMIN_DISCORD_IDS is not set — no user will bootstrap as a site admin."
  );
}

const app = express();
const PORT = process.env.PORT ?? 3001;

// CORS - allow requests from the React client
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json());

// Session middleware — backed by SQLite so sessions survive a server restart
// (the express-session default MemoryStore does not).
const SqliteStore = createSqliteStoreFactory(session);
app.use(
  session({
    store: new SqliteStore({
      client: sqlite,
      expired: {
        clear: true,
        intervalMs: 15 * 60 * 1000, // 15 min
      },
    }),
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

// Passport
configurePassport();
app.use(passport.initialize());
app.use(passport.session());

// Uploads — serve screenshots stored locally
const UPLOADS_DIR = path.join(__dirname, "../uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOADS_DIR));

// Routes
app.use("/auth", authRouter);
app.use("/api/me", meRouter);
app.use("/api/admin", siteAdminRouter);
app.use("/api/bingos", bingosRouter);
app.use("/api/bingos/:slug/mod", modRouter);
app.use("/api/bingos/:slug/admin", adminRouter);
app.use(errorHandler);

const server = http.createServer(app);
initWebSocketServer(server);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
