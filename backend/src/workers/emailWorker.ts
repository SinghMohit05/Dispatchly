import { Worker, Job, DelayedError } from "bullmq";
import { prisma } from "../db/index.js";
import { sendEmail } from "../services/mailer.js";
import {
  emailQueue,
  redisConnection,
  type EmailJobData,
} from "../queues/emailQueue.js";
import {
  checkAndIncrementRateLimit,
  getNextRunTimestamp,
} from "../services/rateLimiter.js";
import { env } from "../config/env.js";

// ── Worker ──────────────────────────────────────────────────
// Processes due jobs from the `email-jobs` queue.
// Concurrency is controlled by WORKER_CONCURRENCY from env.

export const emailWorker = new Worker<EmailJobData>(
  "email-jobs",
  async (job: Job<EmailJobData>, token?: string) => {
    const { emailJobId, senderId: _senderId } = job.data;

    console.log(`⚙️  Processing job ${job.id} (emailJob: ${emailJobId})`);

    // ── Load EmailJob + Sender ──
    const emailJob = await prisma.emailJob.findUnique({
      where: { id: emailJobId },
      include: { sender: true },
    });

    if (!emailJob) {
      console.warn(`⚠️  EmailJob ${emailJobId} not found in DB — skipping`);
      return;
    }

    // ── Idempotency guard (Architecture.md §3) ──
    // Re-check the DB row before sending. If it's already SENT, another worker
    // instance or a prior execution already handled it.
    // Skip sending immediately and resolve the BullMQ job cleanly.
    if (emailJob.status === "SENT") {
      console.log(
        `⏭️  [Idempotency Guard] EmailJob ${emailJobId} is already SENT in database — skipping send`
      );
      return;
    }

    if (emailJob.status !== "SCHEDULED") {
      console.log(
        `⏭️  EmailJob ${emailJobId} status is '${emailJob.status}' (not SCHEDULED) — skipping`
      );
      return;
    }

    // ── Rate Limiting (Architecture.md §4) ──
    // Atomically check both per-sender and global hourly counters in Redis.
    // Under limit → increment counter, continue to send.
    // At limit    → do NOT fail the job. Defer to next hour window via moveToDelayed.
    const rateCheck = await checkAndIncrementRateLimit(emailJob.senderId);

    if (!rateCheck.allowed) {
      const nextRunMs = getNextRunTimestamp(emailJob.scheduledFor);
      const nextRunDate = new Date(nextRunMs);

      // Update database scheduledFor time so UI/DB reflects next execution
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: { scheduledFor: nextRunDate },
      });

      console.log(
        `⏳ [Rate Limit] Sender '${emailJob.senderId}' reached ${rateCheck.reason} limit ` +
          `(${rateCheck.senderCount}/${env.MAX_EMAILS_PER_HOUR_PER_SENDER} sender, ` +
          `${rateCheck.globalCount}/${env.MAX_EMAILS_PER_HOUR} global). ` +
          `Deferring job ${job.id} to ${nextRunDate.toISOString()}`
      );

      // Move job to delayed in BullMQ and throw DelayedError so BullMQ
      // leaves the job in the delayed set without recording a failure.
      await job.moveToDelayed(nextRunMs, token);
      throw new DelayedError();
    }

    // ── Send via Ethereal ──
    try {
      const result = await sendEmail(emailJob.sender, emailJob);

      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: "SENT",
          sentAt: new Date(),
          error: null,
        },
      });

      console.log(
        `✅ EmailJob ${emailJobId} → SENT (messageId: ${result.messageId})`
      );
      if (result.previewUrl) {
        console.log(`   🔗 Preview: ${result.previewUrl}`);
      }

      // Minimum gap between individual sends (MIN_DELAY_MS)
      if (env.MIN_DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, env.MIN_DELAY_MS));
      }
    } catch (err) {
      // Re-throw DelayedError untouched so BullMQ processes the deferred state
      if (err instanceof DelayedError) {
        throw err;
      }

      const errorMessage =
        err instanceof Error ? err.message : "Unknown send error";

      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: "FAILED",
          error: errorMessage,
        },
      });

      console.error(`❌ EmailJob ${emailJobId} → FAILED: ${errorMessage}`);

      // Re-throw so BullMQ can apply its retry/backoff strategy
      throw err;
    }
  },
  {
    connection: redisConnection,
    concurrency: env.WORKER_CONCURRENCY,
  }
);

// ── Lifecycle logging ───────────────────────────────────────
emailWorker.on("ready", async () => {
  console.log(
    `🔧 Email worker ready (concurrency: ${env.WORKER_CONCURRENCY})`
  );

  try {
    const counts = await emailQueue.getJobCounts(
      "delayed",
      "waiting",
      "active"
    );
    const totalResumed = counts.delayed + counts.waiting + counts.active;
    console.log(
      `🔄 [Recovery] BullMQ resumed ${totalResumed} pending job(s) from Redis on boot: ` +
        `${counts.delayed} delayed, ${counts.waiting} waiting, ${counts.active} active`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️  Could not fetch initial queue counts from Redis: ${message}`);
  }
});

emailWorker.on("error", (err) => {
  // Connection-level errors — the worker auto-reconnects
  console.error("🔧 Email worker error:", err.message);
});
