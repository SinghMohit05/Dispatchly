// Services barrel — business logic (mailer, rateLimiter, search)
export { sendEmail } from "./mailer.js";
export { scheduleEmail } from "./emailScheduler.js";
export {
  checkAndIncrementRateLimit,
  getRateLimitStatus,
  getCurrentHourWindow,
  getNextHourWindowStart,
  getNextRunTimestamp,
  redisClient,
} from "./rateLimiter.js";
export {
  searchEmailJobs,
  indexEmailJob,
  deleteIndexedEmailJob,
  initSearchIndex,
} from "./search.js";
