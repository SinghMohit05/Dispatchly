import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { scheduleEmail, scheduleEmailBatch } from "../services/emailScheduler.js";
import { listSenders, createSender, deleteSender } from "../services/senderStore.js";
import { listJobs, getJobById, clearAllJobs } from "../services/jobStore.js";
import { searchEmailJobs } from "../services/search.js";
import { verifySender } from "../services/mailer.js";
import { AppError } from "../middlewares/errorHandler.js";

// ── Validation schemas ──────────────────────────────────────

const scheduleEmailSchema = z
  .object({
    senderId: z.string().min(1, "senderId is required"),
    recipient: z.string().email("recipient must be a valid email").optional(),
    recipients: z.array(z.string().email("recipient must be a valid email")).min(1).optional(),
    subject: z.string().min(1, "subject is required"),
    body: z.string().min(1, "body is required"),
    scheduledFor: z
      .string()
      .datetime({ message: "scheduledFor must be an ISO 8601 datetime" })
      .transform((s) => new Date(s))
      .optional(),
    startTime: z
      .string()
      .datetime({ message: "startTime must be an ISO 8601 datetime" })
      .transform((s) => new Date(s))
      .optional(),
    delaySeconds: z.coerce.number().nonnegative().optional().default(0),
    hourlyLimit: z.coerce.number().positive().optional(),
  })
  .refine(
    (data) => data.recipient || (data.recipients && data.recipients.length > 0),
    {
      message: "Either recipient or recipients array must be provided",
      path: ["recipient"],
    }
  );

const statusFilterSchema = z
  .enum(["SCHEDULED", "SENT", "FAILED"])
  .optional();

// ── Handlers ────────────────────────────────────────────────

/**
 * POST /api/emails/schedule
 * Schedules a single email or a batch of emails.
 */
export async function handleScheduleEmail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = scheduleEmailSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError(
        400,
        parsed.error.errors.map((e) => e.message).join("; "),
        "VALIDATION_ERROR"
      );
    }

    const {
      senderId,
      recipient,
      recipients,
      subject,
      body,
      scheduledFor,
      startTime,
      delaySeconds,
      hourlyLimit,
    } = parsed.data;

    // Single recipient request
    if (recipient && (!recipients || recipients.length === 0)) {
      const emailJob = await scheduleEmail({
        senderId,
        recipient,
        subject,
        body,
        scheduledFor: startTime ?? scheduledFor ?? new Date(),
      });

      res.status(201).json({ data: emailJob, error: null });
      return;
    }

    // Batch recipient request
    const targetRecipients = recipients || (recipient ? [recipient] : []);
    const batchResult = await scheduleEmailBatch({
      senderId,
      recipients: targetRecipients,
      subject,
      body,
      startTime: startTime ?? scheduledFor ?? new Date(),
      delaySeconds,
      hourlyLimit,
    });

    res.status(201).json({
      data: {
        message: `Successfully scheduled ${batchResult.count} email(s)`,
        count: batchResult.count,
        firstJobId: batchResult.jobs[0]?.id,
        jobs: batchResult.jobs,
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/emails/senders
 * Lists available senders configured in the system.
 */
export async function handleListSenders(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const senders = await listSenders();
    res.json({ data: senders, error: null });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/emails
 * Lists EmailJob rows.
 */
export async function handleListEmails(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const statusParsed = statusFilterSchema.safeParse(req.query.status);

    if (req.query.status && !statusParsed.success) {
      throw new AppError(
        400,
        "status must be one of: SCHEDULED, SENT, FAILED",
        "VALIDATION_ERROR"
      );
    }

    const jobs = await listJobs(statusParsed.data);
    res.json({ data: jobs, error: null });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/emails/:id
 * Fetches a single EmailJob by ID.
 */
export async function handleGetEmail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const emailJob = await getJobById(req.params.id);

    if (!emailJob) {
      throw new AppError(404, "Email job not found", "NOT_FOUND");
    }

    res.json({ data: emailJob, error: null });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/emails/search?q=...
 * Searches EmailJobs matching against recipient, subject, and body.
 */
export async function handleSearchEmails(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const q = req.query.q as string;

    if (!q || !q.trim()) {
      res.json({ data: [], error: null });
      return;
    }

    let results: any[] = [];
    try {
      results = await searchEmailJobs(q);
    } catch {
      // Fallback: search in local/db jobs
      const allJobs = await listJobs();
      const term = q.toLowerCase();
      results = allJobs.filter(
        (j) =>
          j.subject?.toLowerCase().includes(term) ||
          j.recipient?.toLowerCase().includes(term) ||
          j.body?.toLowerCase().includes(term)
      );
    }

    res.json({ data: results, error: null });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/emails
 * Clears ALL email jobs (scheduled, sent, failed) from all stores.
 */
export async function handleClearAllEmails(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const count = await clearAllJobs();
    res.json({
      data: {
        message: `Successfully cleared ${count} email job(s)`,
        count,
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
}

// ── Sender Management Handlers ──────────────────────────────

const senderInputSchema = z.object({
  fromAddress: z.string().email("A valid email address is required"),
  name: z.string().optional(),
  type: z.enum(["resend", "gmail", "smtp"]),
  pass: z.string().min(1, "Password or API Key is required"),
  host: z.string().optional(),
  port: z.coerce.number().optional(),
  secure: z.boolean().optional(),
});

/**
 * POST /api/emails/senders/verify
 * Tests credentials against the target email service in real-time.
 */
export async function handleVerifySender(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = senderInputSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        parsed.error.errors.map((e) => e.message).join("; "),
        "INVALID_SENDER_PAYLOAD"
      );
    }

    const { fromAddress, name, type, pass, host, port, secure } = parsed.data;

    const verification = await verifySender(
      {
        type,
        user: fromAddress,
        pass,
        host,
        port,
        secure,
        displayName: name,
      },
      fromAddress
    );

    if (!verification.success) {
      res.status(400).json({
        data: null,
        error: {
          code: "VERIFICATION_FAILED",
          message: verification.error || "Failed to verify credentials.",
        },
      });
      return;
    }

    res.json({
      data: { success: true, message: "Connection verified successfully!" },
      error: null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/emails/senders
 * Verifies and persists a new sender account.
 */
export async function handleCreateSender(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = senderInputSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        parsed.error.errors.map((e) => e.message).join("; "),
        "INVALID_SENDER_PAYLOAD"
      );
    }

    const { fromAddress, name, type, pass, host, port, secure } = parsed.data;

    // Verify before persisting
    const verification = await verifySender(
      {
        type,
        user: fromAddress,
        pass,
        host,
        port,
        secure,
        displayName: name,
      },
      fromAddress
    );

    if (!verification.success) {
      res.status(400).json({
        data: null,
        error: {
          code: "SENDER_VERIFICATION_FAILED",
          message: verification.error || "Failed to verify sender credentials.",
        },
      });
      return;
    }

    const created = await createSender({
      fromAddress,
      name,
      credentials: {
        type,
        user: fromAddress,
        pass,
        host,
        port,
        secure,
        displayName: name,
      },
    });

    res.status(201).json({
      data: {
        id: created.id,
        tenantId: created.tenantId,
        fromAddress: created.fromAddress,
        name: created.name,
        type,
        isConfigured: true,
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/emails/senders/:id
 * Deletes a configured sender by ID.
 */
export async function handleDeleteSender(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      throw new AppError(400, "Sender ID is required", "MISSING_SENDER_ID");
    }

    const deleted = await deleteSender(id);
    res.json({
      data: {
        id,
        deleted,
        message: deleted ? "Sender removed successfully." : "Sender not found.",
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
}
