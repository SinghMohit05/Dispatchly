import { Queue, QueueEvents } from "bullmq";
import { env } from "../config/env.js";

// ── Types ───────────────────────────────────────────────────
// Minimal payload stored in each BullMQ job.
// The worker uses emailJobId to load the full row from Postgres.
export interface EmailJobData {
  emailJobId: string;
  senderId: string;
}

// ── Redis connection config (shared by Queue + Worker) ──────
export const redisConnection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
} as const;

// ── Queue ───────────────────────────────────────────────────
export const emailQueue = new Queue<EmailJobData>("email-jobs", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100, // keep last 100 completed for debugging
    removeOnFail: 200, // keep last 200 failed for inspection
    attempts: 3, // BullMQ retries on transient failures
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  },
});

// ── QueueEvents (logging / debugging) ───────────────────────
export const emailQueueEvents = new QueueEvents("email-jobs", {
  connection: redisConnection,
});

emailQueueEvents.on("completed", ({ jobId }) => {
  console.log(`📧 Job ${jobId} completed`);
});

emailQueueEvents.on("failed", ({ jobId, failedReason }) => {
  console.error(`❌ Job ${jobId} failed: ${failedReason}`);
});

console.log("📮 Email queue connected to Redis");
