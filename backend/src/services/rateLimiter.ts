import Redis from "ioredis";
import { env } from "../config/env.js";
import { redisConnection } from "../queues/emailQueue.js";

// ── Shared Redis client for rate limiting & metrics ──────────
export const redisClient = new Redis({
  host: redisConnection.host,
  port: redisConnection.port,
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy(times) {
    if (times > 3) return null; // stop reconnecting if down
    return Math.min(times * 500, 2000);
  },
});

redisClient.on("error", (_err) => {
  // Gracefully log without unhandled event throw when Redis is down
  if (process.env.NODE_ENV === "development") {
    // Only warn once in dev
  }
});

// ── Time & Window Helpers ────────────────────────────────────

/**
 * Returns the hour window string in UTC formatted as YYYY-MM-DD-HH.
 * Example: 2026-09-11-05
 */
export function getCurrentHourWindow(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${d}-${h}`;
}

/**
 * Returns a Date object set to the exact beginning (minute 0, second 0)
 * of the next UTC hour window.
 */
export function getNextHourWindowStart(date: Date = new Date()): Date {
  const next = new Date(date.getTime());
  next.setUTCHours(next.getUTCHours() + 1);
  next.setUTCMinutes(0);
  next.setUTCSeconds(0);
  next.setUTCMilliseconds(0);
  return next;
}

/**
 * Computes target execution timestamp in the next hour window,
 * preserving the job's relative offset within the hour.
 *
 * Example: A job originally scheduled at XX:14:30 will be deferred
 * to (XX+1):14:30, preserving relative ordering among deferred jobs.
 */
export function getNextRunTimestamp(
  originalScheduledFor: Date,
  baseDate: Date = new Date()
): number {
  const nextHourStart = getNextHourWindowStart(baseDate).getTime();
  const offsetWithinHour =
    (originalScheduledFor.getUTCMinutes() * 60 +
      originalScheduledFor.getUTCSeconds()) *
      1000 +
    originalScheduledFor.getUTCMilliseconds();

  return nextHourStart + offsetWithinHour;
}

/**
 * Returns the seconds until the current hour ends, plus a 1-hour buffer.
 * Used for TTL so Redis automatically cleans up old counters.
 */
export function getHourKeyTTL(date: Date = new Date()): number {
  const nextHourMs = getNextHourWindowStart(date).getTime();
  const remainingSecs = Math.max(
    1,
    Math.ceil((nextHourMs - date.getTime()) / 1000)
  );
  // Add 3600 seconds (1 hour buffer) so stats remain inspectable for a full hour after rollover
  return remainingSecs + 3600;
}

// ── Lua Script for Atomic Check-and-Increment ────────────────

/**
 * Atomic rate limiting script:
 * Evaluates both the per-sender counter and the global counter in a single atomic step.
 * If either limit is reached, it returns [0, reason, senderCount, globalCount] without incrementing.
 * If both are under their caps, it atomically increments both and sets appropriate TTL.
 */
const CHECK_AND_INCR_LUA = `
local senderKey = KEYS[1]
local globalKey = KEYS[2]
local maxSender = tonumber(ARGV[1])
local maxGlobal = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])

local senderCount = tonumber(redis.call('GET', senderKey) or '0')
local globalCount = tonumber(redis.call('GET', globalKey) or '0')

if senderCount >= maxSender then
  return {0, 'sender', senderCount, globalCount}
end

if globalCount >= maxGlobal then
  return {0, 'global', senderCount, globalCount}
end

local newSender = redis.call('INCR', senderKey)
if newSender == 1 then
  redis.call('EXPIRE', senderKey, ttl)
end

local newGlobal = redis.call('INCR', globalKey)
if newGlobal == 1 then
  redis.call('EXPIRE', globalKey, ttl)
end

return {1, 'ok', newSender, newGlobal}
`;

export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: "sender" | "global";
  senderCount: number;
  globalCount: number;
}

/**
 * Atomically checks both per-sender and global hourly caps.
 * If under limits, increments both and returns { allowed: true }.
 * If at or above limit, returns { allowed: false, reason: 'sender' | 'global' }.
 */
export async function checkAndIncrementRateLimit(
  senderId: string,
  now: Date = new Date()
): Promise<RateLimitCheckResult> {
  const hourWindow = getCurrentHourWindow(now);
  const senderKey = `ratelimit:${senderId}:${hourWindow}`;
  const globalKey = `ratelimit:global:${hourWindow}`;
  const ttl = getHourKeyTTL(now);

  const rawResult = (await redisClient.eval(
    CHECK_AND_INCR_LUA,
    2,
    senderKey,
    globalKey,
    env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    env.MAX_EMAILS_PER_HOUR,
    ttl
  )) as [number, string, number, number];

  const [code, status, senderCount, globalCount] = rawResult;

  if (code === 1) {
    return {
      allowed: true,
      senderCount,
      globalCount,
    };
  }

  return {
    allowed: false,
    reason: status as "sender" | "global",
    senderCount,
    globalCount,
  };
}

/**
 * Reads current counters for a sender and global window without incrementing.
 */
export async function getRateLimitStatus(
  senderId: string,
  now: Date = new Date()
): Promise<{ senderCount: number; globalCount: number; hourWindow: string }> {
  const hourWindow = getCurrentHourWindow(now);
  const senderKey = `ratelimit:${senderId}:${hourWindow}`;
  const globalKey = `ratelimit:global:${hourWindow}`;

  const [senderVal, globalVal] = await Promise.all([
    redisClient.get(senderKey),
    redisClient.get(globalKey),
  ]);

  return {
    senderCount: parseInt(senderVal || "0", 10),
    globalCount: parseInt(globalVal || "0", 10),
    hourWindow,
  };
}

