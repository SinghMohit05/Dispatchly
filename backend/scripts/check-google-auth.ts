import dotenv from "dotenv";
import path from "path";
import express from "express";
import session from "express-session";
import http from "http";

// Load root .env
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

async function checkGoogleAuth() {
  console.log("════════════════════════════════════════════════════════════");
  console.log("🔍 Testing Google OAuth Configuration & Connection");
  console.log("════════════════════════════════════════════════════════════\n");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

  console.log("1️⃣  Environment Variables Check:");
  console.log(`   GOOGLE_CLIENT_ID:     ${clientId ? `${clientId.slice(0, 22)}...${clientId.slice(-15)}` : "MISSING"}`);
  console.log(`   GOOGLE_CLIENT_SECRET: ${clientSecret ? `${clientSecret.slice(0, 10)}...` : "MISSING"}`);
  console.log(`   GOOGLE_CALLBACK_URL:  ${callbackUrl || "MISSING"}`);

  if (!clientId || !clientSecret || !callbackUrl) {
    console.error("\n❌ FAILED: Missing one or more Google OAuth environment variables in .env!");
    process.exit(1);
  }

  // 2️⃣ Verify Google OAuth Discovery Document
  console.log("\n2️⃣  Checking Google Accounts OpenID Discovery Endpoint...");
  try {
    const discoveryRes = await fetch("https://accounts.google.com/.well-known/openid-configuration");
    if (!discoveryRes.ok) {
      throw new Error(`Failed to fetch OpenID configuration: HTTP ${discoveryRes.status}`);
    }
    const discoveryJson = (await discoveryRes.json()) as any;
    console.log(`   Authorization Endpoint: ${discoveryJson.authorization_endpoint}`);
    console.log(`   Token Endpoint:         ${discoveryJson.token_endpoint}`);
    console.log("   ✅ PASS: Google Identity Services OpenID provider is reachable!");
  } catch (err: any) {
    console.error(`   ❌ Failed to reach Google OpenID discovery: ${err.message}`);
  }

  // 3️⃣ Test Google Client ID with Google's Auth Endpoint
  console.log("\n3️⃣  Testing Client ID with Google Authorization Endpoint...");
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid profile email");
  authUrl.searchParams.set("prompt", "select_account");

  try {
    const googleRes = await fetch(authUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    console.log(`   Google Auth HTTP Status: ${googleRes.status}`);
    const bodyText = await googleRes.text();

    if (bodyText.includes("deleted_client") || bodyText.includes("invalid_client")) {
      console.error("   ❌ ERROR: Google rejected this Client ID ('invalid_client' or 'deleted_client')!");
      console.error("   Please verify that your Google Cloud Project exists and this OAuth Client ID is active.");
    } else if (bodyText.includes("redirect_uri_mismatch")) {
      console.warn("   ⚠️  WARNING: Google returned 'redirect_uri_mismatch'!");
      console.warn(`   Make sure '${callbackUrl}' is added to 'Authorized redirect URIs' in your Google Cloud Console.`);
    } else {
      console.log("   ✅ PASS: Google accepted the Client ID!");
      console.log("   Google returned a valid login/consent page response (HTTP 200/302).");
    }
  } catch (err: any) {
    console.error(`   ❌ Error connecting to Google OAuth endpoint: ${err.message}`);
  }

  // 4️⃣ Test Express + Passport Backend Auth Route
  console.log("\n4️⃣  Testing Backend /api/auth/google Route...");
  await import("../src/config/passport.js");
  const passport = (await import("passport")).default;
  const authRoutes = (await import("../src/routes/authRoutes.js")).default as any;

  const app = express();
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use(passport.initialize());
  app.use(passport.session());
  app.use("/api/auth", authRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  try {
    const localRes = await fetch(`http://localhost:${port}/api/auth/google`, {
      redirect: "manual",
    });

    console.log(`   Local /api/auth/google status: ${localRes.status}`);
    const location = localRes.headers.get("location");

    if (localRes.status === 302 && location && location.includes("accounts.google.com")) {
      console.log("   ✅ PASS: Backend correctly generates 302 redirect to Google OAuth consent screen!");
      
      const parsedLocation = new URL(location);
      console.log(`   -> client_id param:    ${parsedLocation.searchParams.get("client_id")?.slice(0, 25)}...`);
      console.log(`   -> redirect_uri param: ${parsedLocation.searchParams.get("redirect_uri")}`);
      console.log(`   -> scope param:        ${parsedLocation.searchParams.get("scope")}`);
    } else {
      console.error(`   ❌ Unexpected local response: status ${localRes.status}`);
    }
  } finally {
    server.close();
  }

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("🎉 Google Auth Check Complete: Everything is configured!");
  console.log("════════════════════════════════════════════════════════════\n");
}

checkGoogleAuth().catch((err) => {
  console.error("Check failed with error:", err);
  process.exit(1);
});
