import { Request, Response, NextFunction } from "express";

// ── Known application error ─────────────────────────────────
// Throw this from services/controllers to return a typed HTTP error.
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

// ── Centralized error-handling middleware ────────────────────
// Must be registered AFTER all routes (4-arg signature tells Express
// this is an error handler, not a regular middleware).
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      data: null,
      error: { message: err.message, code: err.code ?? null },
    });
    return;
  }

  // Unknown / unexpected error — log full details, return generic 500
  console.error("❌ Unhandled error:", err);
  res.status(500).json({
    data: null,
    error: { message: "Internal server error", code: "INTERNAL_ERROR" },
  });
}
