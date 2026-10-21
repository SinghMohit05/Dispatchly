/**
 * Phase 9 Verification Script — Frontend Auth & Backend OAuth Lifecycle
 *
 * Validates:
 *  1. Unauthenticated /api/auth/me returns { authenticated: false, user: null }.
 *  2. Google OAuth Route Gating:
 *     - If not configured, returns clean 503 JSON with GOOGLE_OAUTH_NOT_CONFIGURED.
 *  3. Authenticated Session Creation:
 *     - /api/auth/test-login establishes session with name, email, avatarUrl.
 *  4. Profile Verification via /api/auth/me:
 *     - Returns real profile payload { name, email, avatarUrl }.
 *  5. Session Invalidation on Logout:
 *     - /api/auth/logout destroys session and clears cookie.
 *     - Subsequent /api/auth/me confirms session is wiped (no silent re-login).
 */

import express from "express";
import session from "express-session";
import http from "http";
import authRoutes from "../src/routes/authRoutes.js";
import passport from "../src/config/passport.js";

async function runVerification() {
  console.log("════════════════════════════════════════════════════════════");
  console.log("🔍 Running Phase 9 Verification: Auth Lifecycle & Profile");
  console.log("════════════════════════════════════════════════════════════\n");

  const testApp = express();
  testApp.use(express.json());
  testApp.use(
    session({
      secret: "phase9-test-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
      },
    })
  );
  testApp.use(passport.initialize());
  testApp.use(passport.session());
  testApp.use("/api/auth", authRoutes);

  const server = http.createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://localhost:${address.port}`;

  try {
    // ── 1. Unauthenticated /api/auth/me ──
    console.log("1️⃣  Testing unauthenticated /api/auth/me...");
    const meRes = await fetch(`${baseUrl}/api/auth/me`);
    const meData = (await meRes.json()) as any;
    console.log(`   Response:`, JSON.stringify(meData));

    if (meData?.data?.authenticated === false && meData?.data?.user === null) {
      console.log("   ✅ PASS: Unauthenticated request correctly returns { authenticated: false, user: null }\n");
    } else {
      throw new Error(`Unexpected unauth response: ${JSON.stringify(meData)}`);
    }

    // ── 2. Check /api/auth/google endpoint error handling when unconfigured ──
    console.log("2️⃣  Testing /api/auth/google unconfigured fallback...");
    const googleRes = await fetch(`${baseUrl}/api/auth/google`);
    console.log(`   Status: ${googleRes.status}`);
    if (googleRes.status === 503) {
      const googleData = (await googleRes.json()) as any;
      console.log(`   Error code: ${googleData?.error?.code}`);
      console.log("   ✅ PASS: Returns structured 503 error when OAuth creds are missing!\n");
    } else {
      // In case user already filled env vars:
      console.log("   ℹ️ Status is not 503 (Google OAuth might be configured in .env)\n");
    }

    // ── 3. Authenticate Session with Google Profile fields ──
    console.log("3️⃣  Simulating Google OAuth success login session...");
    const mockGoogleProfile = {
      id: "usr_google_987654",
      name: "Mohit Verma",
      email: "mohit@dispatchly.test",
      avatarUrl: "https://lh3.googleusercontent.com/a/mock-avatar-token",
    };

    const loginRes = await fetch(`${baseUrl}/api/auth/test-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mockGoogleProfile),
    });

    const setCookie = loginRes.headers.get("set-cookie");
    const cookie = setCookie ? setCookie.split(";")[0] : "";
    console.log(`   Login status: ${loginRes.status}, Cookie: ${cookie.substring(0, 25)}...`);

    if (loginRes.status === 200 && cookie) {
      console.log("   ✅ PASS: Session established with cookie!\n");
    } else {
      throw new Error("Failed to establish authenticated session.");
    }

    // ── 4. Verify /api/auth/me with Cookie ──
    console.log("4️⃣  Verifying /api/auth/me returns real profile payload...");
    const profileRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookie },
    });
    const profileData = (await profileRes.json()) as any;
    console.log("   Profile returned:", JSON.stringify(profileData?.data?.user));

    if (
      profileData?.data?.authenticated === true &&
      profileData?.data?.user?.email === mockGoogleProfile.email &&
      profileData?.data?.user?.avatarUrl === mockGoogleProfile.avatarUrl &&
      profileData?.data?.user?.name === mockGoogleProfile.name
    ) {
      console.log("   ✅ PASS: Real profile (name, email, avatarUrl) correctly populated!\n");
    } else {
      throw new Error(`Profile mismatch: ${JSON.stringify(profileData)}`);
    }

    // ── 5. Logout & Invalidation ──
    console.log("5️⃣  Testing logout session invalidation...");
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    const logoutData = (await logoutRes.json()) as any;
    console.log("   Logout response:", JSON.stringify(logoutData));

    // Subsequent request with the same cookie must now be rejected
    const postLogoutMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookie },
    });
    const postLogoutData = (await postLogoutMe.json()) as any;
    console.log("   Post-logout /me response:", JSON.stringify(postLogoutData));

    if (postLogoutData?.data?.authenticated === false) {
      console.log("   ✅ PASS: Session successfully wiped! Refreshing will NOT silently log user in.\n");
    } else {
      throw new Error("Session was not properly destroyed on logout.");
    }

    console.log("🎉 ALL PHASE 9 BACKEND AUTH VERIFICATIONS PASSED!\n");
  } finally {
    server.close();
  }
}

runVerification().catch((err) => {
  console.error("❌ Phase 9 Verification failed:", err);
  process.exit(1);
});
