import "dotenv/config";
import express from "express";
import session from "express-session";
import cors from "cors";
import passport from "passport";
import { configurePassport } from "./auth/discord";
import authRouter from "./routes/auth";
import apiRouter from "./routes/api";

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
