import dotenv from "dotenv";
import path from "path";
// Load .env from the monorepo root regardless of which directory npm runs from
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
import express from "express";
import session from "express-session";
import cors from "cors";
import passport from "passport";
import { configurePassport } from "./auth/discord";
import authRouter from "./routes/auth";
import apiRouter from "./routes/api";

const REQUIRED_ENV = [
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_CALLBACK_URL",
  "DISCORD_BOT_TOKEN",
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

// Session middleware
app.use(
  session({
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

// Routes
app.use("/auth", authRouter);
app.use("/api", apiRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
