import { PrismaClient } from "../src/db/generated/index.js";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...\n");

  // ── Test Sender ──
  // Uses Ethereal credentials placeholder — replace with real
  // Ethereal creds from https://ethereal.email when testing sends.
  const sender = await prisma.sender.upsert({
    where: { id: "seed-sender-01" },
    update: {},
    create: {
      id: "seed-sender-01",
      tenantId: "tenant-default",
      fromAddress: "dispatcher@dispatchly.test",
      etherealCredentials: JSON.stringify({
        user: "ethereal-user@ethereal.email",
        pass: "ethereal-pass",
      }),
    },
  });

  console.log(`  ✅ Sender: ${sender.fromAddress} (id: ${sender.id})`);
  console.log(`     tenantId: ${sender.tenantId}`);
  console.log(`     credentials: ${sender.etherealCredentials}\n`);

  console.log("🌱 Seeding complete!");
}

main()
  .catch((e: unknown) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
