import { PrismaClient } from "../src/db/generated/index.js";

const p = new PrismaClient();

async function main() {
  try {
    const c = await p.emailJob.deleteMany({});
    console.log(`Deleted ${c.count} email jobs from database`);
  } catch (e: any) {
    console.log("DB unavailable or no records:", e.message);
  } finally {
    await p.$disconnect();
  }
}

main();
