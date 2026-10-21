import { PrismaClient } from "./generated/index.js";

// Singleton Prisma client instance.
// In development, we attach it to `globalThis` to survive HMR reloads
// without opening extra database connections.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
export type { Prisma } from "./generated/index.js";
