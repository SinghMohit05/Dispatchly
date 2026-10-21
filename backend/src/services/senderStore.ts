import fs from "fs";
import path from "path";
import { prisma } from "../db/index.js";
import { env } from "../config/env.js";
import type { AnySender, SenderCredentials } from "./mailer.js";
import { parseSenderCredentials } from "./mailer.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const SENDERS_FILE = path.join(DATA_DIR, "senders.json");

// Ensure data directory exists
function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (e) {
    // ignore
  }
}

// Read local senders JSON
function readLocalSenders(): AnySender[] {
  ensureDataDir();
  try {
    if (fs.existsSync(SENDERS_FILE)) {
      const data = fs.readFileSync(SENDERS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn("⚠️ Failed to read local senders.json:", e);
  }
  return [];
}

// Write local senders JSON
function writeLocalSenders(senders: AnySender[]) {
  ensureDataDir();
  try {
    fs.writeFileSync(SENDERS_FILE, JSON.stringify(senders, null, 2), "utf-8");
  } catch (e) {
    console.warn("⚠️ Failed to write local senders.json:", e);
  }
}

/**
 * Lists all senders, merging Prisma, local storage, and .env defaults.
 */
export async function listSenders(): Promise<
  Array<{
    id: string;
    tenantId: string;
    fromAddress: string;
    name?: string;
    type: "gmail" | "smtp" | "ethereal" | "resend";
    isConfigured: boolean;
  }>
> {
  const result: Array<{
    id: string;
    tenantId: string;
    fromAddress: string;
    name?: string;
    type: "gmail" | "smtp" | "ethereal" | "resend";
    isConfigured: boolean;
  }> = [];

  const seenIds = new Set<string>();

  // 1. Read local JSON senders
  const localSenders = readLocalSenders();
  for (const s of localSenders) {
    if (!seenIds.has(s.id)) {
      seenIds.add(s.id);
      const creds = s.credentials || parseSenderCredentials(s.etherealCredentials);
      result.push({
        id: s.id,
        tenantId: s.tenantId || "tenant-default",
        fromAddress: s.fromAddress,
        name: s.name || creds?.displayName || undefined,
        type: creds?.type || "smtp",
        isConfigured: true,
      });
    }
  }

  // 2. Try reading from Prisma
  try {
    const dbSenders = await prisma.sender.findMany({
      orderBy: { createdAt: "asc" },
    });

    for (const s of dbSenders) {
      if (!seenIds.has(s.id)) {
        seenIds.add(s.id);
        const creds = parseSenderCredentials(s.etherealCredentials);
        result.push({
          id: s.id,
          tenantId: s.tenantId,
          fromAddress: s.fromAddress,
          name: creds?.displayName,
          type: creds?.type || "ethereal",
          isConfigured: Boolean(creds && !creds.user.startsWith("ethereal-")),
        });
      }
    }
  } catch {
    // Database offline, local storage already covered
  }

  // 3. If RESEND_API_KEY is configured in .env, expose the global Resend sender
  if (env.RESEND_API_KEY && !seenIds.has("env-resend-sender")) {
    seenIds.add("env-resend-sender");
    result.unshift({
      id: "env-resend-sender",
      tenantId: "tenant-default",
      fromAddress: env.RESEND_FROM_ADDRESS || "onboarding@resend.dev",
      name: "Resend (Global API)",
      type: "resend",
      isConfigured: true,
    });
  }

  // 4. If absolutely nothing is configured, provide the seed test sender
  if (result.length === 0) {
    result.push({
      id: "seed-sender-01",
      tenantId: "tenant-default",
      fromAddress: "dispatcher@dispatchly.test",
      name: "Dispatchly Simulator",
      type: "ethereal",
      isConfigured: false,
    });
  }

  return result;
}

/**
 * Retrieves a sender with full credentials for email dispatch.
 */
export async function getSenderById(id: string): Promise<AnySender | null> {
  // 1. Env-based Resend sender
  if (id === "env-resend-sender" && env.RESEND_API_KEY) {
    return {
      id: "env-resend-sender",
      tenantId: "tenant-default",
      fromAddress: env.RESEND_FROM_ADDRESS || "onboarding@resend.dev",
      name: "Resend (Global API)",
      credentials: {
        type: "resend",
        user: env.RESEND_FROM_ADDRESS || "onboarding@resend.dev",
        pass: env.RESEND_API_KEY,
        displayName: "Resend",
      },
    };
  }

  // 2. Local JSON check
  const localSenders = readLocalSenders();
  const foundLocal = localSenders.find((s) => s.id === id);
  if (foundLocal) {
    return foundLocal;
  }

  // 3. Prisma check
  try {
    const dbSender = await prisma.sender.findUnique({
      where: { id },
    });
    if (dbSender) {
      const creds = parseSenderCredentials(dbSender.etherealCredentials);
      return {
        id: dbSender.id,
        tenantId: dbSender.tenantId,
        fromAddress: dbSender.fromAddress,
        etherealCredentials: dbSender.etherealCredentials,
        credentials: creds || undefined,
      };
    }
  } catch {
    // DB offline
  }

  // 4. Default seed sender fallback
  if (id === "seed-sender-01") {
    return {
      id: "seed-sender-01",
      tenantId: "tenant-default",
      fromAddress: "dispatcher@dispatchly.test",
      name: "Dispatchly Simulator",
      credentials: {
        type: "ethereal",
        user: env.SMTP_USER || "dispatcher@dispatchly.test",
        pass: env.SMTP_PASS || "dispatchly",
      },
    };
  }

  return null;
}

/**
 * Creates and persists a new sender.
 */
export async function createSender(data: {
  fromAddress: string;
  name?: string;
  credentials: SenderCredentials;
  tenantId?: string;
}): Promise<AnySender> {
  const id = `snd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const tenantId = data.tenantId || "tenant-default";

  const newSender: AnySender = {
    id,
    tenantId,
    fromAddress: data.fromAddress.trim().toLowerCase(),
    name: data.name?.trim() || undefined,
    credentials: {
      ...data.credentials,
      user: data.credentials.user.trim(),
      pass: data.credentials.pass ? data.credentials.pass.trim() : undefined,
      displayName: data.name?.trim(),
    },
    etherealCredentials: JSON.stringify({
      ...data.credentials,
      user: data.credentials.user.trim(),
      pass: data.credentials.pass ? data.credentials.pass.trim() : "",
      displayName: data.name?.trim(),
    }),
  };

  // Always save to local store for offline resilience (upsert by fromAddress)
  const localSenders = readLocalSenders();
  const existingIdx = localSenders.findIndex(
    (s) => s.fromAddress.toLowerCase() === newSender.fromAddress.toLowerCase()
  );
  if (existingIdx !== -1) {
    newSender.id = localSenders[existingIdx].id;
    localSenders[existingIdx] = newSender;
  } else {
    localSenders.push(newSender);
  }
  writeLocalSenders(localSenders);

  // Also try saving to Prisma if DB is available
  try {
    await prisma.sender.create({
      data: {
        id: newSender.id,
        tenantId: newSender.tenantId,
        fromAddress: newSender.fromAddress,
        etherealCredentials: newSender.etherealCredentials || "{}",
      },
    });
  } catch (e) {
    console.warn("⚠️ Could not persist sender to Prisma (using local store):", e);
  }

  return newSender;
}

/**
 * Deletes a sender by ID.
 */
export async function deleteSender(id: string): Promise<boolean> {
  let deleted = false;

  const localSenders = readLocalSenders();
  const filtered = localSenders.filter((s) => s.id !== id);
  if (filtered.length !== localSenders.length) {
    writeLocalSenders(filtered);
    deleted = true;
  }

  try {
    await prisma.sender.delete({ where: { id } });
    deleted = true;
  } catch {
    // ignore
  }

  return deleted;
}
