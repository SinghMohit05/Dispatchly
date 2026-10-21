import { z } from "zod";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const envSchema = z.object({
  // ── Server ──
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // ── Database ──
  DATABASE_URL: z.string().url(),

  // ── Redis ──
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),

  // ── BullMQ / Worker ──
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  MIN_DELAY_MS: z.coerce.number().int().nonnegative().default(500),

  // ── Rate Limits ──
  MAX_EMAILS_PER_HOUR: z.coerce.number().int().positive().default(500),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce
    .number()
    .int()
    .positive()
    .default(100),

  // ── SMTP (Ethereal / Custom) ──
  SMTP_HOST: z.string().min(1).default("smtp.ethereal.email"),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),

  // ── Resend (modern email API) ──
  RESEND_API_KEY: z.string().optional().default(""),
  RESEND_FROM_ADDRESS: z.string().optional().default(""),

  // ── Google OAuth (required from Phase 9) ──
  GOOGLE_CLIENT_ID: z.string().optional().or(z.literal("")),
  GOOGLE_CLIENT_SECRET: z.string().optional().or(z.literal("")),
  GOOGLE_CALLBACK_URL: z.string().url().optional().or(z.literal("")),

  // ── Session (required from Phase 9) ──
  SESSION_SECRET: z.string().optional().or(z.literal("")),

  // ── Frontend ──
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error(
      "❌ Invalid environment variables:",
      JSON.stringify(parsed.error.flatten().fieldErrors, null, 2)
    );
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof envSchema>;
