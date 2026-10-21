import { getSenderById } from "./senderStore.js";
import { createAndScheduleJob } from "./jobStore.js";
import { AppError } from "../middlewares/errorHandler.js";
import { redisClient } from "./rateLimiter.js";

// ── Types ───────────────────────────────────────────────────

export interface ScheduleEmailInput {
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledFor: Date;
}

export interface ScheduleEmailBatchInput {
  senderId: string;
  recipients: string[];
  subject: string;
  body: string;
  scheduledFor?: Date;
  startTime?: Date;
  delaySeconds?: number;
  hourlyLimit?: number;
}

// ── Batch Scheduling Logic ──────────────────────────────────

/**
 * Schedules a batch of emails for multiple recipients in a single call.
 * Resiliently handles both distributed (Postgres + Redis) and standalone modes.
 */
export async function scheduleEmailBatch(input: ScheduleEmailBatchInput) {
  if (!input.recipients || input.recipients.length === 0) {
    throw new AppError(400, "At least one recipient is required", "INVALID_RECIPIENTS");
  }

  // ── Validate sender exists (checks .env, local store, & Prisma) ──
  const sender = await getSenderById(input.senderId);

  if (!sender) {
    throw new AppError(404, `Sender '${input.senderId}' not found`, "SENDER_NOT_FOUND");
  }

  const baseTime = input.startTime ?? input.scheduledFor ?? new Date();
  const delayMs = Math.max(0, (input.delaySeconds ?? 0) * 1000);
  const hourlyLimit = input.hourlyLimit && input.hourlyLimit > 0 ? input.hourlyLimit : null;

  // If hourlyLimit is specified, attempt sync to Redis if available
  if (hourlyLimit) {
    try {
      await redisClient.set(`ratelimit:custom_sender_limit:${input.senderId}`, String(hourlyLimit));
    } catch {
      // Non-blocking
    }
  }

  const createdJobs = [];

  for (let i = 0; i < input.recipients.length; i++) {
    const recipient = input.recipients[i];

    // Compute scheduledFor timestamp
    let scheduledTimeMs: number;

    if (hourlyLimit) {
      const hourWindowIndex = Math.floor(i / hourlyLimit);
      const indexInHourWindow = i % hourlyLimit;

      const hourWindowStartMs = baseTime.getTime() + hourWindowIndex * 3600 * 1000;
      scheduledTimeMs = hourWindowStartMs + indexInHourWindow * delayMs;
    } else {
      scheduledTimeMs = baseTime.getTime() + i * delayMs;
    }

    const scheduledFor = new Date(scheduledTimeMs);

    // ── Resiliently create and enqueue job ──
    const emailJob = await createAndScheduleJob({
      senderId: input.senderId,
      recipient,
      subject: input.subject,
      body: input.body,
      scheduledFor,
    });

    createdJobs.push(emailJob);
  }

  console.log(
    `📋 Batch scheduled ${createdJobs.length} email(s) for sender ${input.senderId} (${sender.fromAddress}) ` +
      `(first run: ${createdJobs[0]?.scheduledFor?.toISOString() || new Date().toISOString()}, delay: ${input.delaySeconds ?? 0}s)`
  );

  return {
    count: createdJobs.length,
    jobs: createdJobs,
  };
}

// ── Single Scheduling Logic (backward compatibility) ─────────

/**
 * Backward-compatible wrapper for scheduling a single email.
 */
export async function scheduleEmail(input: ScheduleEmailInput) {
  const result = await scheduleEmailBatch({
    senderId: input.senderId,
    recipients: [input.recipient],
    subject: input.subject,
    body: input.body,
    scheduledFor: input.scheduledFor,
    delaySeconds: 0,
  });

  return result.jobs[0];
}
