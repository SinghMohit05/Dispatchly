import { prisma } from "../db/index.js";
import type { EmailJob } from "../db/generated/index.js";

/**
 * Searches EmailJobs matching against recipient, subject, and body using PostgreSQL.
 * Fast, zero-memory-overhead, case-insensitive partial matching (ILIKE).
 */
export async function searchEmailJobs(q: string) {
  const cleanQ = q.trim();
  if (!cleanQ) {
    return [];
  }

  return await prisma.emailJob.findMany({
    where: {
      OR: [
        { subject: { contains: cleanQ, mode: "insensitive" } },
        { recipient: { contains: cleanQ, mode: "insensitive" } },
        { body: { contains: cleanQ, mode: "insensitive" } },
      ],
    },
    orderBy: { scheduledFor: "asc" },
    include: { sender: { select: { fromAddress: true } } },
  });
}

/**
 * No-op: PostgreSQL records are directly written to the database by Prisma,
 * eliminating the need for an external search cluster.
 */
export async function indexEmailJob(_emailJob?: EmailJob | null): Promise<void> {}
export async function deleteIndexedEmailJob(_id: string): Promise<void> {}
export async function initSearchIndex(): Promise<void> {}
