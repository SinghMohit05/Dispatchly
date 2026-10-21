import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import session from "express-session";
import passport from "./config/passport.js";
import emailRoutes from "./routes/emailRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { requireAuth } from "./middlewares/authGuard.js";
import { bullBoardRouter } from "./services/adminQueueDashboard.js";

// ── Side-effect imports: start worker + queue ───────────────
// Importing these modules connects to Redis and starts processing.
import "./queues/emailQueue.js";
import "./workers/emailWorker.js";

const app = express();

// ── Security & parsing ──
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows Bull Board UI assets to render
  })
);
app.use(
  cors({
    origin: [env.FRONTEND_URL, "http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Session Middleware ──
app.use(
  session({
    secret: env.SESSION_SECRET || "dispatchly-session-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true in production behind HTTPS
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
    },
  })
);

// ── Passport Middleware ──
app.use(passport.initialize());
app.use(passport.session());

// ── Health check ──
app.get("/health", (_req, res) => {
  res.json({ data: { status: "ok", timestamp: new Date().toISOString() }, error: null });
});

// ── API routes ──
app.use("/api/auth", authRoutes);
app.use("/api/emails", emailRoutes);

// ── Ops Dashboard (Bull Board) ──
// Gated strictly behind requireAuth middleware
app.use("/admin/queues", requireAuth, bullBoardRouter);

// ── Centralized error handler (must be AFTER routes) ──
app.use(errorHandler);

// ── Start ──
app.listen(env.PORT, () => {
  console.log(
    `🚀 Dispatchly backend running on http://localhost:${env.PORT} [${env.NODE_ENV}]`
  );
});

export default app;
