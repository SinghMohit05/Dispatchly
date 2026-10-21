import fs from "fs";
import path from "path";
import { prisma } from "../db/index.js";
import { sendEmail, type AnyEmailJob, type SendResult } from "./mailer.js";
import { getSenderById } from "./senderStore.js";
import { emailQueue } from "../queues/emailQueue.js";
import { env } from "../config/env.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const JOBS_FILE = path.join(DATA_DIR, "jobs.json");

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (e) {
    // ignore
  }
}

function readLocalJobs(): AnyEmailJob[] {
  ensureDataDir();
  try {
    if (fs.existsSync(JOBS_FILE)) {
      const data = fs.readFileSync(JOBS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn("⚠️ Failed to read local jobs.json:", e);
  }
  return [];
}

function writeLocalJobs(jobs: AnyEmailJob[]) {
  ensureDataDir();
  try {
    fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2), "utf-8");
  } catch (e) {
    console.warn("⚠️ Failed to write local jobs.json:", e);
  }
}

// Active local timer scheduler map (for when Redis / BullMQ is offline)
const activeTimers = new Map<string, NodeJS.Timeout>();

/**
 * Execute a job dispatch immediately or on due time.
 */
export async function executeJobDispatch(jobId: string): Promise<SendResult | null> {
  const job = await getJobById(jobId);
  if (!job) {
    console.warn(`[Dispatcher] Job ${jobId} not found`);
    return null;
  }

  if (job.status === "SENT") {
    console.log(`[Dispatcher] Job ${jobId} is already SENT`);
    return null;
  }

  const sender = await getSenderById(job.senderId);
  if (!sender) {
    const errorMsg = `Sender ${job.senderId} not found`;
    await updateJob(jobId, { status: "FAILED", error: errorMsg });
    return null;
  }

  try {
    const result = await sendEmail(sender, job);
    await updateJob(jobId, {
      status: "SENT",
      sentAt: new Date(),
      error: null,
    });
    return result;
  } catch (err: any) {
    const errorMsg = err?.message || "Send failed";
    await updateJob(jobId, {
      status: "FAILED",
      error: errorMsg,
    });
    throw err;
  }
}

/**
 * Schedules execution via BullMQ, or falls back to internal Node timer.
 */
export async function enqueueOrScheduleJob(
  job: AnyEmailJob,
  scheduledFor: Date
): Promise<void> {
  const delayMs = Math.max(0, scheduledFor.getTime() - Date.now());

  let enqueued = false;

  // 1. Try BullMQ with a fast 500ms timeout
  try {
    const queuePromise = emailQueue.add(
      "send-email",
      { emailJobId: job.id, senderId: job.senderId },
      {
        jobId: `email:${job.id}`,
        delay: Math.max(delayMs, env.MIN_DELAY_MS),
      }
    );
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Queue timeout")), 500)
    );
    await Promise.race([queuePromise, timeoutPromise]);
    enqueued = true;
    console.log(`📮 Job ${job.id} enqueued to BullMQ (delay: ${delayMs}ms)`);
  } catch {
    // BullMQ offline, fall back to in-process timer
  }

  if (enqueued) return;

  // 2. Fallback in-process timer
  if (delayMs <= 500) {
    // Immediate / near-immediate execution
    setImmediate(async () => {
      try {
        await executeJobDispatch(job.id);
      } catch (err) {
        console.error(`❌ Immediate dispatch error for ${job.id}:`, err);
      }
    });
  } else {
    // Scheduled execution
    const timer = setTimeout(async () => {
      activeTimers.delete(job.id);
      try {
        await executeJobDispatch(job.id);
      } catch (err) {
        console.error(`❌ Scheduled dispatch error for ${job.id}:`, err);
      }
    }, delayMs);

    activeTimers.set(job.id, timer);
  }
}

/**
 * Creates an EmailJob in Prisma and local storage, and schedules dispatch.
 */
export async function createAndScheduleJob(input: {
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledFor: Date;
}): Promise<AnyEmailJob> {
  const id = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();
  const emailJob: AnyEmailJob = {
    id,
    senderId: input.senderId,
    recipient: input.recipient,
    subject: input.subject,
    body: input.body,
    scheduledFor: input.scheduledFor,
    status: "SCHEDULED",
    createdAt: nowIso,
  };

  // 1. Try Prisma with fast timeout
  try {
    const prismaPromise = prisma.emailJob.create({
      data: {
        id: emailJob.id,
        senderId: emailJob.senderId,
        recipient: emailJob.recipient,
        subject: emailJob.subject,
        body: emailJob.body,
        scheduledFor: emailJob.scheduledFor!,
        status: "SCHEDULED",
      },
    });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Prisma timeout")), 500)
    );
    const created: any = await Promise.race([prismaPromise, timeoutPromise]);
    if (created?.id) emailJob.id = created.id;
  } catch {
    // Fallback to local store
  }

  // 2. Always persist locally
  const localJobs = readLocalJobs();
  localJobs.unshift(emailJob);
  writeLocalJobs(localJobs);

  // 3. Schedule delivery
  await enqueueOrScheduleJob(emailJob, input.scheduledFor);

  return emailJob;
}

/**
 * Lists all email jobs, with optional status filter.
 */
export async function listJobs(status?: string): Promise<any[]> {
  const result: any[] = [];
  const seenIds = new Set<string>();

  // 1. Try Prisma first with fast timeout
  try {
    const where = status ? { status: status as any } : {};
    const dbPromise = prisma.emailJob.findMany({
      where,
      orderBy: { scheduledFor: "desc" },
      include: { sender: { select: { fromAddress: true } } },
    });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Prisma timeout")), 500)
    );
    const dbJobs: any = await Promise.race([dbPromise, timeoutPromise]);

    for (const j of dbJobs) {
      seenIds.add(j.id);
      result.push({
        ...j,
        scheduledFor: j.scheduledFor.toISOString(),
        sentAt: j.sentAt?.toISOString() || null,
        fromAddress: j.sender?.fromAddress,
      });
    }
  } catch {
    // Prisma offline
  }

  // 2. Read local store
  const localJobs = readLocalJobs();
  for (const j of localJobs) {
    if (!seenIds.has(j.id)) {
      if (!status || j.status === status) {
        seenIds.add(j.id);
        const sender = await getSenderById(j.senderId);
        result.push({
          ...j,
          createdAt: j.createdAt
            ? new Date(j.createdAt).toISOString()
            : new Date().toISOString(),
          scheduledFor: j.scheduledFor
            ? new Date(j.scheduledFor).toISOString()
            : new Date().toISOString(),
          sentAt: j.sentAt ? new Date(j.sentAt).toISOString() : null,
          fromAddress: sender?.fromAddress || "unknown",
          sender: sender ? { fromAddress: sender.fromAddress } : undefined,
        });
      }
    }
  }

  return result;
}

/**
 * Retrieves a single job by ID.
 */
export async function getJobById(id: string): Promise<AnyEmailJob | null> {
  // 1. Try Prisma with fast timeout
  try {
    const dbPromise = prisma.emailJob.findUnique({
      where: { id },
      include: { sender: { select: { fromAddress: true } } },
    });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Prisma timeout")), 500)
    );
    const dbJob: any = await Promise.race([dbPromise, timeoutPromise]);
    if (dbJob) {
      return {
        ...dbJob,
        senderId: dbJob.senderId,
      };
    }
  } catch {
    // DB offline
  }

  // 2. Local store
  const localJobs = readLocalJobs();
  const found = localJobs.find((j) => j.id === id);
  return found || null;
}

/**
 * Updates a job status and details.
 */
export async function updateJob(
  id: string,
  updates: Partial<AnyEmailJob>
): Promise<void> {
  // 1. Update local store
  const localJobs = readLocalJobs();
  const index = localJobs.findIndex((j) => j.id === id);
  if (index !== -1) {
    localJobs[index] = {
      ...localJobs[index],
      ...updates,
    };
    writeLocalJobs(localJobs);
  }

  // 2. Update Prisma if online (non-blocking)
  try {
    await prisma.emailJob.update({
      where: { id },
      data: {
        status: updates.status as any,
        sentAt: updates.sentAt,
        error: updates.error,
        scheduledFor: updates.scheduledFor,
      },
    });
  } catch {
    // DB offline
  }
}

/**
 * Deletes ALL email jobs from local storage, database, and BullMQ queue.
 * Returns the count of deleted jobs.
 */
export async function clearAllJobs(): Promise<number> {
  let count = 0;

  // 1. Count and clear local store
  const localJobs = readLocalJobs();
  count = localJobs.length;
  writeLocalJobs([]);

  // 2. Clear all active timers
  for (const [id, timer] of activeTimers.entries()) {
    clearTimeout(timer);
    activeTimers.delete(id);
  }

  // 3. Clear Prisma (delete all email jobs) with fast timeout
  try {
    const dbPromise = prisma.emailJob.deleteMany({});
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Prisma timeout")), 500)
    );
    const result: any = await Promise.race([dbPromise, timeoutPromise]);
    count = Math.max(count, result.count);
  } catch {
    // DB offline
  }

  // 4. Drain BullMQ queue with fast timeout
  try {
    const queuePromise = emailQueue.obliterate({ force: true });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Queue timeout")), 500)
    );
    await Promise.race([queuePromise, timeoutPromise]);
    console.log("🧹 BullMQ queue drained");
  } catch {
    // Queue offline
  }

  console.log(`🧹 Cleared ${count} email job(s) from all stores`);
  return count;
}
