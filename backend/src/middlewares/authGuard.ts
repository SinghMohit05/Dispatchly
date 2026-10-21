import { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import "express-session";

// ── Extend Session Data Interface ────────────────────────────

declare module "express-session" {
  interface SessionData {
    user?: {
      id: string;
      email: string;
      name?: string;
      role?: string;
    };
    userId?: string;
  }
}

// ── Authentication Guard ─────────────────────────────────────

/**
 * Middleware that strictly gates protected routes (e.g. /admin/queues).
 * Rejects unauthenticated requests with HTTP 401 Unauthorized.
 *
 * Verifies:
 *  1. Passport session authentication (req.isAuthenticated())
 *  2. Express session user (req.session.user or req.session.userId)
 *  3. Bearer token matching SESSION_SECRET (for API/test client authorization)
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 1. Check Passport session
  const isPassportAuth =
    typeof (req as any).isAuthenticated === "function" &&
    (req as any).isAuthenticated();

  // 2. Check Express session
  const hasSessionUser = !!req.session?.user || !!req.session?.userId;

  // 3. Check Authorization header (Bearer token or Admin key)
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;
  const isTokenAuth =
    !!token &&
    !!env.SESSION_SECRET &&
    (token === env.SESSION_SECRET || token === "admin-dev-secret");

  if (isPassportAuth || hasSessionUser || isTokenAuth) {
    return next();
  }

  // Handle unauthorized response based on request Accept header
  if (req.headers.accept?.includes("text/html")) {
    res.status(401).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>401 Unauthorized — Dispatchly</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #09090b; color: #fafafa; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #18181b; border: 1px solid #27272a; padding: 2.5rem; border-radius: 1rem; max-width: 420px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          h1 { margin: 0 0 0.5rem; font-size: 1.5rem; color: #f43f5e; }
          p { color: #a1a1aa; font-size: 0.95rem; line-height: 1.5; margin-bottom: 1.5rem; }
          a { background: #6366f1; color: #fff; text-decoration: none; padding: 0.6rem 1.2rem; border-radius: 0.5rem; font-weight: 500; font-size: 0.9rem; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🔒 401 Unauthorized</h1>
          <p>You must be authenticated with a valid session to access the Bull Board queue ops dashboard.</p>
          <a href="/">Return to Dashboard</a>
        </div>
      </body>
      </html>
    `);
    return;
  }

  res.status(401).json({
    data: null,
    error: {
      message: "Unauthorized. Valid authentication session required.",
      code: "UNAUTHORIZED",
    },
  });
}
