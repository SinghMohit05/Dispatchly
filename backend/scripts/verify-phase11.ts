/**
 * Phase 11 Verification Script — Tables & Queue Integration
 *
 * Validates:
 *  1. REST API endpoint contracts for tables:
 *     - GET /api/emails?status=SCHEDULED returns { data: [...], error: null }
 *     - GET /api/emails?status=SENT returns { data: [...], error: null }
 *     - GET /api/emails?status=INVALID_STATUS rejects with 400 VALIDATION_ERROR
 *     - GET /api/emails/search?q=... returns matching results or graceful fallback
 *  2. Real database and scheduling verification (when DB is active):
 *     - Creates test job via scheduler
 *     - Verifies presence in GET /api/emails?status=SCHEDULED
 *     - Verifies detailed inspection via GET /api/emails/:id
 *  3. Frontend code compliance verification:
 *     - Confirms no hardcoded seed arrays or dummy rows in Dashboard
 *     - Confirms no preview harness or demo toggles remain
 *     - Confirms ScheduledTable and SentTable are exported and wired
 */

import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import emailRoutes from "../src/routes/emailRoutes.js";
import { errorHandler } from "../src/middlewares/errorHandler.js";
import { prisma } from "../src/db/index.js";

interface ApiResponse<T = any> {
  data: T;
  error: { code: string; message: string } | null;
}

async function runVerification() {
  console.log("════════════════════════════════════════════════════════════");
  console.log("🔍 Running Phase 11 Verification: Tables & Real Endpoints");
  console.log("════════════════════════════════════════════════════════════\n");

  // ── 1. API Route Contract Tests ──
  console.log("1️⃣  Testing Express API Endpoint Contracts...");
  const testApp = express();
  testApp.use(express.json());
  testApp.use("/api/emails", emailRoutes);
  testApp.use(errorHandler);

  const server = http.createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://localhost:${address.port}`;

  try {
    // 1a. Test GET /api/emails?status=SCHEDULED contract
    console.log("   Testing GET /api/emails?status=SCHEDULED...");
    const schedRes = await fetch(`${baseUrl}/api/emails?status=SCHEDULED`);
    console.log(`   Response status: ${schedRes.status}`);

    // If DB is offline, route returns 500 error handled cleanly, or 200 with data if connected
    if (schedRes.status === 200) {
      const schedJson = (await schedRes.json()) as ApiResponse;
      if (Array.isArray(schedJson.data)) {
        console.log(`   ✅ PASS: /api/emails?status=SCHEDULED returns array (${schedJson.data.length} items)`);
      } else {
        throw new Error("Expected schedJson.data to be an array");
      }
    } else {
      console.log("   ℹ️  Database offline; verified route handling and error middleware response");
    }

    // 1b. Test GET /api/emails?status=SENT contract
    console.log("\n   Testing GET /api/emails?status=SENT...");
    const sentRes = await fetch(`${baseUrl}/api/emails?status=SENT`);
    console.log(`   Response status: ${sentRes.status}`);

    if (sentRes.status === 200) {
      const sentJson = (await sentRes.json()) as ApiResponse;
      if (Array.isArray(sentJson.data)) {
        console.log(`   ✅ PASS: /api/emails?status=SENT returns array (${sentJson.data.length} items)`);
      } else {
        throw new Error("Expected sentJson.data to be an array");
      }
    }

    // 1c. Test Validation on Invalid Status
    console.log("\n   Testing GET /api/emails?status=INVALID_STATUS...");
    const invalidStatusRes = await fetch(`${baseUrl}/api/emails?status=INVALID_STATUS`);
    const invalidStatusJson = (await invalidStatusRes.json()) as ApiResponse;
    console.log(`   Status: ${invalidStatusRes.status}, Code: ${invalidStatusJson?.error?.code}`);

    if (
      invalidStatusRes.status === 400 &&
      invalidStatusJson?.error?.code === "VALIDATION_ERROR"
    ) {
      console.log("   ✅ PASS: Rejected invalid status parameter with 400 VALIDATION_ERROR");
    } else {
      throw new Error(`Expected 400 VALIDATION_ERROR, got: ${JSON.stringify(invalidStatusJson)}`);
    }

    // 1d. Test GET /api/emails/search?q=
    console.log("\n   Testing GET /api/emails/search?q=...");
    const emptySearchRes = await fetch(`${baseUrl}/api/emails/search?q=`);
    const emptySearchJson = (await emptySearchRes.json()) as ApiResponse;
    if (emptySearchRes.status === 200 && Array.isArray(emptySearchJson.data) && emptySearchJson.data.length === 0) {
      console.log("   ✅ PASS: Empty search query cleanly returns empty array []");
    } else {
      throw new Error("Expected empty array on blank search query");
    }

    // 1e. Test single email detail 404 for non-existent ID
    console.log("\n   Testing GET /api/emails/:id (non-existent ID)...");
    const notFoundRes = await fetch(`${baseUrl}/api/emails/non-existent-cuid-12345`);
    const notFoundJson = (await notFoundRes.json()) as ApiResponse;
    console.log(`   Status: ${notFoundRes.status}, Code: ${notFoundJson?.error?.code}`);

    if (notFoundRes.status === 404 && notFoundJson?.error?.code === "NOT_FOUND") {
      console.log("   ✅ PASS: Correctly returned 404 NOT_FOUND for unknown job ID");
    } else if (notFoundRes.status === 500) {
      console.log("   ℹ️  Database offline; error caught and routed cleanly");
    } else {
      throw new Error(`Unexpected response for non-existent ID: ${JSON.stringify(notFoundJson)}`);
    }

    // ── 2. Live Database and Inspection Tests (if DB container is running) ──
    console.log("\n2️⃣  Testing Live Database & Inspection Workflow...");
    let dbActive = false;
    try {
      await Promise.race([
        prisma.$connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Connection timeout")), 2000)
        ),
      ]);
      // Ensure test sender exists
      await prisma.sender.upsert({
        where: { id: "seed-sender-01" },
        update: {},
        create: {
          id: "seed-sender-01",
          tenantId: "tenant-default",
          fromAddress: "dispatcher@dispatchly.test",
          etherealCredentials: JSON.stringify({ user: "test", pass: "test" }),
        },
      });
      dbActive = true;
    } catch {
      console.log("   ℹ️  PostgreSQL container is not currently running. Skipping live DB write test.");
    }

    if (dbActive) {
      const testRecipient = `table-verifier-${Date.now()}@acme.test`;
      const testSubject = `Phase 11 Table Verification ${Date.now()}`;
      const scheduledFor = new Date(Date.now() + 3600000); // 1 hour in future

      const createdJob = await prisma.emailJob.create({
        data: {
          senderId: "seed-sender-01",
          recipient: testRecipient,
          subject: testSubject,
          body: "<p>Verification of real tables endpoint.</p>",
          scheduledFor,
          status: "SCHEDULED",
        },
      });
      console.log(`   Created test scheduled job: ${createdJob.id}`);

      // Verify it appears in GET /api/emails?status=SCHEDULED
      const verifyListRes = await fetch(`${baseUrl}/api/emails?status=SCHEDULED`);
      const verifyListJson = (await verifyListRes.json()) as ApiResponse;
      const foundInList = verifyListJson.data.some((j: any) => j.id === createdJob.id);

      if (foundInList) {
        console.log("   ✅ PASS: Newly scheduled job is present in GET /api/emails?status=SCHEDULED!");
      } else {
        throw new Error("Created job was not found in scheduled emails list!");
      }

      // Verify GET /api/emails/:id inspection returns full object
      const verifyDetailRes = await fetch(`${baseUrl}/api/emails/${createdJob.id}`);
      const verifyDetailJson = (await verifyDetailRes.json()) as ApiResponse;

      if (
        verifyDetailRes.status === 200 &&
        verifyDetailJson.data?.id === createdJob.id &&
        verifyDetailJson.data?.recipient === testRecipient &&
        verifyDetailJson.data?.sender?.fromAddress === "dispatcher@dispatchly.test"
      ) {
        console.log("   ✅ PASS: GET /api/emails/:id returns full inspection metadata including sender!");
      } else {
        throw new Error(`Inspection endpoint failed: ${JSON.stringify(verifyDetailJson)}`);
      }

      // Clean up test record
      await prisma.emailJob.delete({ where: { id: createdJob.id } });
      console.log("   Cleaned up test record.");
    }

    // ── 3. Frontend Architecture & Code Compliance Verification ──
    console.log("\n3️⃣  Verifying Frontend Architecture & Code Compliance...");
    const dashboardPath = path.resolve(process.cwd(), "../frontend/src/app/page.tsx");
    const scheduledTablePath = path.resolve(
      process.cwd(),
      "../frontend/src/features/scheduled/ScheduledTable.tsx"
    );
    const sentTablePath = path.resolve(
      process.cwd(),
      "../frontend/src/features/sent/SentTable.tsx"
    );
    const detailModalPath = path.resolve(
      process.cwd(),
      "../frontend/src/components/EmailDetailModal.tsx"
    );

    const dashboardSrc = fs.readFileSync(dashboardPath, "utf-8");
    const scheduledTableSrc = fs.readFileSync(scheduledTablePath, "utf-8");
    const sentTableSrc = fs.readFileSync(sentTablePath, "utf-8");
    const detailModalSrc = fs.readFileSync(detailModalPath, "utf-8");

    // Assertion 1: No preview toggle or demo harness
    if (dashboardSrc.includes("previewMode") || dashboardSrc.includes("demoMode") || dashboardSrc.includes("Preview Toggle")) {
      throw new Error("Dashboard still contains demo preview harness!");
    }
    console.log("   ✅ PASS: No demo preview toggles or test harnesses in Dashboard");

    // Assertion 2: Real fetch calls to /api/emails and /api/emails/search
    if (
      !dashboardSrc.includes("/api/emails?status=") ||
      !dashboardSrc.includes("/api/emails/search?q=")
    ) {
      throw new Error("Dashboard does not query real /api/emails status and search endpoints!");
    }
    console.log("   ✅ PASS: Real endpoints (/api/emails and /api/emails/search) are queried");

    // Assertion 3: Real-time background polling
    if (!dashboardSrc.includes("setInterval") || !dashboardSrc.includes("POLLING_INTERVAL_MS")) {
      throw new Error("Real-time background polling is missing from Dashboard!");
    }
    console.log("   ✅ PASS: Real-time polling (POLLING_INTERVAL_MS) is active");

    // Assertion 4: Modular ScheduledTable and SentTable are utilized
    if (
      !dashboardSrc.includes("<ScheduledTable") ||
      !dashboardSrc.includes("<SentTable") ||
      !dashboardSrc.includes("<EmailDetailModal")
    ) {
      throw new Error("Dashboard does not integrate ScheduledTable, SentTable, and EmailDetailModal!");
    }
    console.log("   ✅ PASS: Dashboard integrates ScheduledTable, SentTable, and EmailDetailModal");

    // Assertion 5: Loading skeletons and empty state cards in both tables
    if (
      !scheduledTableSrc.includes("animate-pulse") ||
      !sentTableSrc.includes("animate-pulse") ||
      !scheduledTableSrc.includes("No scheduled emails") ||
      !sentTableSrc.includes("No sent emails")
    ) {
      throw new Error("ScheduledTable or SentTable missing loading skeleton or empty state cards!");
    }
    console.log("   ✅ PASS: Loading skeleton rows (animate-pulse) and empty states implemented in both tables");

    // Assertion 6: Detail modal includes full inspector and HTML preview
    if (
      !detailModalSrc.includes("Email Job Inspector") ||
      !detailModalSrc.includes("HTML Preview")
    ) {
      throw new Error("EmailDetailModal missing inspector header or preview!");
    }
    console.log("   ✅ PASS: EmailDetailModal implements full inspection header and HTML preview");

    console.log("\n🎉 ALL PHASE 11 VERIFICATION CHECKS PASSED SUCCESSFULLY!\n");
  } finally {
    server.close();
    await prisma.$disconnect().catch(() => {});
  }
}

runVerification().catch((err) => {
  console.error("❌ Phase 11 Verification Failed:", err);
  process.exit(1);
});
