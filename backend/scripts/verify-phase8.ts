/**
 * Phase 8 Verification Script — Ops Dashboard (Bull Board & Auth Gating)
 *
 * Validates:
 *  1. Strict Route Gating:
 *     - Unauthenticated requests to /admin/queues are rejected with HTTP 401.
 *  2. Session-Based Authentication:
 *     - Logging in via /api/auth/test-login establishes a session cookie.
 *     - Requesting /admin/queues with that cookie returns HTTP 200 OK with Bull Board UI.
 *  3. Bearer Token Authentication:
 *     - Passing Authorization: Bearer <SESSION_SECRET> returns HTTP 200 OK.
 *  4. Session Invalidation on Logout:
 *     - Logging out via /api/auth/logout revokes access -> subsequent request returns HTTP 401.
 */

import express from "express";
import session from "express-session";
import http from "http";
import { requireAuth } from "../src/middlewares/authGuard.js";
import { bullBoardRouter } from "../src/services/adminQueueDashboard.js";
import authRoutes from "../src/routes/authRoutes.js";
import { env } from "../src/config/env.js";

async function runVerification() {
  console.log("════════════════════════════════════════════════════════════");
  console.log("🔍 Running Phase 8 Verification: Bull Board & Auth Guard");
  console.log("════════════════════════════════════════════════════════════\n");

  // Setup test server
  const testApp = express();
  testApp.use(express.json());
  testApp.use(
    session({
      secret: env.SESSION_SECRET || "test-session-secret-phase8",
      resave: false,
      saveUninitialized: false,
    })
  );

  testApp.use("/api/auth", authRoutes);
  testApp.use("/admin/queues", requireAuth, bullBoardRouter);

  const server = http.createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://localhost:${address.port}`;

  try {
    // ── 1. Unauthenticated Access Test ──
    console.log("1️⃣  Testing unauthenticated access to /admin/queues...");
    const unauthRes = await fetch(`${baseUrl}/admin/queues`, {
      headers: { Accept: "application/json" },
    });
    console.log(`   Response status: ${unauthRes.status} (Expected: 401)`);

    if (unauthRes.status === 401) {
      console.log(
        "   ✅ PASS: Route strictly rejected unauthenticated request with 401 Unauthorized!\n"
      );
    } else {
      console.error(
        `   ❌ FAIL: Route returned status ${unauthRes.status} instead of 401.\n`
      );
    }

    // ── 2. Authenticate Session Test ──
    console.log("2️⃣  Authenticating session via /api/auth/test-login...");
    const loginRes = await fetch(`${baseUrl}/api/auth/test-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "operator@dispatchly.test" }),
    });

    const setCookie = loginRes.headers.get("set-cookie");
    const cookie = setCookie ? setCookie.split(";")[0] : "";
    console.log(`   Login status: ${loginRes.status}, Session cookie received: ${!!cookie}`);

    // ── 3. Authenticated Access Test with Session Cookie ──
    console.log("3️⃣  Accessing /admin/queues WITH session cookie...");
    const authRes = await fetch(`${baseUrl}/admin/queues`, {
      headers: {
        Cookie: cookie,
        Accept: "text/html",
      },
    });
    console.log(`   Response status: ${authRes.status} (Expected: 200)`);

    if (authRes.status === 200) {
      console.log(
        "   ✅ PASS: Route granted access to Bull Board dashboard for authenticated session!\n"
      );
    } else {
      console.error(
        `   ❌ FAIL: Authenticated session returned status ${authRes.status} instead of 200.\n`
      );
    }

    // ── 4. Bearer Token Access Test ──
    console.log("4️⃣  Testing Bearer Token authorization...");
    const secret = env.SESSION_SECRET || "admin-dev-secret";
    const bearerRes = await fetch(`${baseUrl}/admin/queues`, {
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "text/html",
      },
    });
    console.log(`   Response status: ${bearerRes.status} (Expected: 200)`);

    if (bearerRes.status === 200) {
      console.log(
        "   ✅ PASS: Route granted access to Bull Board via Bearer token authorization!\n"
      );
    } else {
      console.error(
        `   ❌ FAIL: Bearer token returned status ${bearerRes.status} instead of 200.\n`
      );
    }

    // ── 5. Logout & Revocation Test ──
    console.log("5️⃣  Logging out session and testing access revocation...");
    await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie },
    });

    const postLogoutRes = await fetch(`${baseUrl}/admin/queues`, {
      headers: {
        Cookie: cookie,
        Accept: "application/json",
      },
    });
    console.log(`   Response status after logout: ${postLogoutRes.status} (Expected: 401)`);

    if (postLogoutRes.status === 401) {
      console.log(
        "   ✅ PASS: Access revoked immediately upon session destruction (401 Unauthorized).\n"
      );
    } else {
      console.error(
        `   ❌ FAIL: Session still accessible after logout (status: ${postLogoutRes.status}).\n`
      );
    }
  } finally {
    server.close();
  }

  console.log("════════════════════════════════════════════════════════════");
  console.log("🏁 Phase 8 Verification Complete");
  console.log("════════════════════════════════════════════════════════════");
}

runVerification()
  .catch((err) => {
    console.error("Verification error:", err);
  })
  .finally(() => {
    process.exit(0);
  });
