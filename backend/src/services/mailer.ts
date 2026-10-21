import nodemailer from "nodemailer";
import { Resend } from "resend";
import type { Sender, EmailJob } from "../db/generated/index.js";
import { env } from "../config/env.js";

// ── Resend Client ───────────────────────────────────────────

let resendClient: Resend | null = null;

export function getResendClient(): Resend | null {
  if (resendClient) return resendClient;
  const apiKey = env.RESEND_API_KEY;
  if (apiKey) {
    resendClient = new Resend(apiKey);
    return resendClient;
  }
  return null;
}

// ── Types ───────────────────────────────────────────────────

export interface OAuth2Credentials {
  user: string;
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
  accessToken?: string;
}

export interface SenderCredentials {
  type?: "gmail" | "smtp" | "ethereal" | "resend";
  user: string;
  pass?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  displayName?: string;
  oauth2?: OAuth2Credentials;
}

export interface AnySender {
  id: string;
  tenantId: string;
  fromAddress: string;
  name?: string | null;
  etherealCredentials?: string | null;
  credentials?: SenderCredentials | null;
}

export interface AnyEmailJob {
  id: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledFor?: Date;
  status?: string;
  sentAt?: Date | null;
  error?: string | null;
  createdAt?: string | Date;
}

export interface SendResult {
  messageId: string;
  previewUrl: string | false;
  isRealDelivery: boolean;
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Parse credentials stored as JSON on the sender record.
 */
export function parseSenderCredentials(raw?: string | null): SenderCredentials | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      type: (parsed.type as any) || (parsed.user && String(parsed.user).endsWith("@gmail.com") ? "gmail" : "smtp"),
      user: String(parsed.user || ""),
      pass: typeof parsed.pass === "string" ? parsed.pass : undefined,
      host: typeof parsed.host === "string" ? parsed.host : undefined,
      port: typeof parsed.port === "number" ? parsed.port : undefined,
      secure: typeof parsed.secure === "boolean" ? parsed.secure : undefined,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : undefined,
      oauth2: (parsed.oauth2 as any) || undefined,
    };
  } catch {
    return null;
  }
}

// ── Resend Email Sending ────────────────────────────────────

/**
 * Send an email via Resend API.
 * Uses sender's explicit Resend API key or env.RESEND_API_KEY.
 * Falls back safely to RESEND_FROM_ADDRESS or onboarding@resend.dev.
 */
async function sendViaResend(
  sender: AnySender | Sender,
  emailJob: AnyEmailJob | EmailJob,
  displayName?: string | null
): Promise<SendResult> {
  const creds =
    (sender as AnySender).credentials ||
    parseSenderCredentials(sender.etherealCredentials);

  const apiKey = creds?.pass || env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Resend API key is not configured. Set RESEND_API_KEY in your .env file or add a sender with an API key."
    );
  }

  const client = new Resend(apiKey);

  let fromAddress = sender.fromAddress;
  if (!fromAddress || fromAddress.endsWith(".test") || fromAddress.endsWith("@ethereal.email")) {
    fromAddress = env.RESEND_FROM_ADDRESS || "onboarding@resend.dev";
  }

  const fromHeader = displayName
    ? `${displayName} <${fromAddress}>`
    : fromAddress;

  const { data, error } = await client.emails.send({
    from: fromHeader,
    to: [emailJob.recipient],
    subject: emailJob.subject,
    html: emailJob.body.replace(/\n/g, "<br>"),
    text: emailJob.body,
  });

  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }

  const messageId = data?.id || `resend_${Date.now()}`;

  console.log(
    `📧 [Resend] Real email dispatched to ${emailJob.recipient}`,
    `\n   From: ${fromHeader}`,
    `\n   Subject: ${emailJob.subject}`,
    `\n   MessageId: ${messageId}`
  );

  return {
    messageId,
    previewUrl: false,
    isRealDelivery: true,
  };
}

// ── Google OAuth2 ───────────────────────────────────────────

/**
 * Refreshes an expired Google OAuth2 access token using the permanent refresh token.
 */
export async function refreshGoogleAccessToken(oauth2: OAuth2Credentials): Promise<string> {
  if (!oauth2.refreshToken) {
    if (oauth2.accessToken) return oauth2.accessToken;
    throw new Error("No refresh token or access token available for Google OAuth account.");
  }

  const clientId = oauth2.clientId || env.GOOGLE_CLIENT_ID || "";
  const clientSecret = oauth2.clientSecret || env.GOOGLE_CLIENT_SECRET || "";

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: oauth2.refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const errJson: any = await res.json().catch(() => ({}));
    throw new Error(
      `Google OAuth token refresh failed: ${errJson?.error_description || res.statusText}`
    );
  }

  const data: any = await res.json();
  oauth2.accessToken = data.access_token;
  return data.access_token;
}

/**
 * Dispatches a real email directly via Google's official Gmail API (messages.send).
 */
export async function sendViaGoogleGmailApi(
  oauth2: OAuth2Credentials,
  fromAddress: string,
  displayName: string | undefined,
  emailJob: AnyEmailJob | EmailJob
): Promise<SendResult> {
  let token = oauth2.accessToken;
  if (!token && oauth2.refreshToken) {
    token = await refreshGoogleAccessToken(oauth2);
  }

  const fromHeader = displayName ? `"${displayName}" <${fromAddress}>` : fromAddress;

  // Build standard RFC 2822 email format
  const emailLines = [
    `From: ${fromHeader}`,
    `To: ${emailJob.recipient}`,
    `Subject: =?utf-8?B?${Buffer.from(emailJob.subject).toString("base64")}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    emailJob.body.replace(/\n/g, "<br>"),
  ];

  const raw = Buffer.from(emailLines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const executeSend = async (authToken: string) => {
    return fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
  };

  let res = await executeSend(token || "");

  // If 401 Unauthorized (token expired), auto-refresh and retry once
  if (res.status === 401 && oauth2.refreshToken) {
    console.log("🔄 Google access token expired. Refreshing token...");
    token = await refreshGoogleAccessToken(oauth2);
    res = await executeSend(token);
  }

  if (!res.ok) {
    const errData: any = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message || `Google Gmail API dispatch failed with HTTP ${res.status}`
    );
  }

  const resultData: any = await res.json();
  const messageId = resultData.id || `gmail_${Date.now()}`;

  console.log(
    `📧 [Google Gmail API] Dispatched real email to ${emailJob.recipient} (id: ${messageId})`
  );

  return {
    messageId,
    previewUrl: false,
    isRealDelivery: true,
  };
}

// ── SMTP / Nodemailer ───────────────────────────────────────

/**
 * Build a Nodemailer transport from explicit credentials.
 */
export function buildTransportFromCreds(
  creds: SenderCredentials,
  fromAddress?: string
): nodemailer.Transporter {
  const isGmail =
    creds.type === "gmail" ||
    (creds.user && creds.user.toLowerCase().endsWith("@gmail.com")) ||
    (fromAddress && fromAddress.toLowerCase().endsWith("@gmail.com")) ||
    (creds.host && creds.host.includes("gmail.com"));

  if (isGmail && creds.pass) {
    const cleanPass = creds.pass.replace(/\s+/g, "");
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: creds.user,
        pass: cleanPass,
      },
    });
  }

  // Custom SMTP or Ethereal
  const host = creds.host || env.SMTP_HOST;
  const port = creds.port || env.SMTP_PORT;
  const secure = creds.secure ?? (port === 465);

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: creds.user,
      pass: creds.pass || "",
    },
  });
}

/**
 * Build a Nodemailer transport for the given sender.
 * Supports Gmail, custom SMTP, and Ethereal fallback.
 */
function createTransport(sender: AnySender | Sender): {
  transport: nodemailer.Transporter;
  isRealDelivery: boolean;
} {
  // 1. Check if sender has explicit credentials object or JSON
  const creds =
    (sender as AnySender).credentials ||
    parseSenderCredentials(sender.etherealCredentials);

  if (creds && !creds.user.startsWith("ethereal-")) {
    const isGmail =
      creds.type === "gmail" ||
      creds.user.toLowerCase().endsWith("@gmail.com") ||
      sender.fromAddress.toLowerCase().endsWith("@gmail.com");

    return {
      transport: buildTransportFromCreds(creds, sender.fromAddress),
      isRealDelivery: isGmail || (Boolean(creds.host) && creds.host !== "smtp.ethereal.email"),
    };
  }

  // 2. Fallback to global SMTP / Ethereal from .env
  const isGlobalEthereal = env.SMTP_HOST.includes("ethereal.email");
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: creds?.user ?? env.SMTP_USER,
      pass: creds?.pass ?? env.SMTP_PASS,
    },
  });

  return {
    transport,
    isRealDelivery: !isGlobalEthereal && Boolean(env.SMTP_USER),
  };
}

// ── Public API ──────────────────────────────────────────────

/**
 * Verifies SMTP / Gmail credentials against the mail server in real-time.
 */
export async function verifyTransporter(
  creds: SenderCredentials,
  fromAddress?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const transport = buildTransportFromCreds(creds, fromAddress);
    await transport.verify();
    transport.close();
    return { success: true };
  } catch (err: any) {
    let msg = err?.message || "Verification failed";
    if (
      msg.includes("535") ||
      msg.includes("BadCredentials") ||
      msg.includes("Username and Password not accepted") ||
      msg.includes("Invalid login")
    ) {
      msg =
        "Authentication failed. Please verify your Gmail address and 16-character App Password (ensure 2-Step Verification is enabled on your Google Account).";
    }
    return { success: false, error: msg };
  }
}

/**
 * Universal sender credential verifier.
 * Checks Resend API key or SMTP/Gmail connection in real-time.
 */
export async function verifySender(
  creds: SenderCredentials,
  fromAddress?: string
): Promise<{ success: boolean; error?: string }> {
  if (creds.type === "resend") {
    const apiKey = creds.pass || env.RESEND_API_KEY;
    if (!apiKey) {
      return { success: false, error: "Please provide a valid Resend API key." };
    }

    if (fromAddress && fromAddress.toLowerCase().endsWith("@gmail.com")) {
      return {
        success: false,
        error:
          "Resend does not permit sending from personal @gmail.com addresses. Please use 'onboarding@resend.dev' for testing, verify a custom domain in Resend, or switch to the 'Gmail' tab to connect your Gmail account with an App Password.",
      };
    }

    try {
      const client = new Resend(apiKey);
      const res = await client.apiKeys.list();
      if (res.error) {
        const errMsg = res.error.message || "";
        // If Resend returns "This API key is restricted to only send emails",
        // the API key is authentic and active with Sending Access permissions.
        // Since Dispatchly uses this key exclusively to send emails, this is valid!
        if (
          errMsg.toLowerCase().includes("restricted to only send emails") ||
          errMsg.toLowerCase().includes("only send emails")
        ) {
          return { success: true };
        }
        return {
          success: false,
          error: errMsg || "Invalid Resend API key. Please check your key in resend.com/api-keys.",
        };
      }
      return { success: true };
    } catch (err: any) {
      const errMsg = err?.message || "";
      if (
        errMsg.toLowerCase().includes("restricted to only send emails") ||
        errMsg.toLowerCase().includes("only send emails")
      ) {
        return { success: true };
      }
      return {
        success: false,
        error: errMsg || "Failed to reach Resend API.",
      };
    }
  }

  return verifyTransporter(creds, fromAddress);
}

/**
 * Send an email using the best available transport.
 * Priority:
 * 1. Resend (if sender is 'resend', or if global RESEND_API_KEY is configured and sender is test/simulator)
 * 2. Google OAuth2 (if sender has OAuth credentials)
 * 3. Gmail App Password / Custom SMTP / Ethereal fallback
 */
export async function sendEmail(
  sender: AnySender | Sender,
  emailJob: AnyEmailJob | EmailJob
): Promise<SendResult> {
  const creds =
    (sender as AnySender).credentials ||
    parseSenderCredentials(sender.etherealCredentials);
  const displayName = creds?.displayName || (sender as AnySender).name || undefined;

  // 1. Resend API
  if (
    creds?.type === "resend" ||
    (Boolean(env.RESEND_API_KEY) && (!creds?.type || creds?.type === "ethereal" || sender.id === "seed-sender-01"))
  ) {
    console.log(
      `⚡ Dispatching via Resend API for sender: ${sender.fromAddress} → ${emailJob.recipient}`
    );
    return sendViaResend(sender, emailJob, displayName);
  }

  // 2. Direct Google OAuth2 sending
  if (creds?.oauth2?.refreshToken || creds?.oauth2?.accessToken) {
    console.log(
      `⚡ Dispatched via Google OAuth 2.0 connection for sender: ${sender.fromAddress}`
    );
    return sendViaGoogleGmailApi(
      creds.oauth2,
      sender.fromAddress,
      displayName,
      emailJob
    );
  }

  // 3. Fallback to Nodemailer SMTP transport
  const { transport, isRealDelivery } = createTransport(sender);

  try {
    const fromHeader = displayName
      ? `"${displayName}" <${sender.fromAddress}>`
      : sender.fromAddress;

    const info = await transport.sendMail({
      from: fromHeader,
      to: emailJob.recipient,
      subject: emailJob.subject,
      html: emailJob.body.replace(/\n/g, "<br>"),
      text: emailJob.body,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);

    console.log(
      `📧 Email dispatched ${isRealDelivery ? "[REAL DELIVERY]" : "[TEST / ETHEREAL]"}`,
      `\n   From: ${fromHeader}`,
      `\n   To: ${emailJob.recipient}`,
      `\n   Subject: ${emailJob.subject}`,
      `\n   MessageId: ${info.messageId}`,
      previewUrl ? `\n   Preview URL: ${previewUrl}` : ""
    );

    return {
      messageId: info.messageId,
      previewUrl,
      isRealDelivery,
    };
  } finally {
    transport.close();
  }
}
