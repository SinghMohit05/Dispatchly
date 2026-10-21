# Dispatchly — High-Throughput Email Dispatch & Outreach Scheduler

<p align="center">
  <img src="Dispatchly_Logo.png" alt="Dispatchly Logo" width="220" />
</p>

<p align="center">
  <strong>Production-grade, distributed cold outreach & email job scheduling engine.</strong><br>
  Built with <strong>Next.js 15</strong>, <strong>Express</strong>, <strong>BullMQ</strong>, <strong>Redis</strong>, <strong>PostgreSQL (Prisma)</strong>, <strong>Elasticsearch</strong>, <strong>Resend</strong>, <strong>Google Gmail API</strong>, and <strong>Slack</strong>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18%2B-green.svg?style=flat-square" alt="Node version" />
  <img src="https://img.shields.io/badge/Next.js-15-black.svg?style=flat-square" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-Strict-blue.svg?style=flat-square" alt="TypeScript" />
  <img src="https://img.shields.io/badge/BullMQ-Redis-red.svg?style=flat-square" alt="BullMQ" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791.svg?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Elasticsearch-8.x-005571.svg?style=flat-square" alt="Elasticsearch" />
  <img src="https://img.shields.io/badge/License-MIT-purple.svg?style=flat-square" alt="License" />
</p>

---

## Table of Contents
1. [Overview & Architectural Vision](#overview--architectural-vision)
2. [Key Capabilities](#key-capabilities)
3. [System Architecture](#system-architecture)
4. [Project Structure](#project-structure)
5. [Quick Start Guide](#quick-start-guide)
6. [Supported Email Delivery Providers](#supported-email-delivery-providers)
7. [Environment Variables Reference](#environment-variables-reference)
8. [Deep Dive: Scheduling, Concurrency & Persistence](#deep-dive-scheduling-concurrency--persistence)
9. [Deep Dive: Atomic Rate Limiting & Overflows](#deep-dive-atomic-rate-limiting--overflows)
10. [REST API Specification](#rest-api-specification)
11. [Verification & Automated Test Suite](#verification--automated-test-suite)
12. [License](#license)

---

## Overview & Architectural Vision

**Dispatchly** is an enterprise-grade outbound cold email orchestration system. Traditional email dispatchers rely on cron jobs or polling intervals that suffer from drift, lock contention, server crashes, and duplicate delivery under scale. 

Dispatchly solves this by using **pure BullMQ delayed jobs** backed by Redis sorted sets and PostgreSQL state locks:
- **Zero Cron**: Millisecond-accurate scheduling without polling loops, OS crons, or `node-cron`.
- **Zero Message Loss**: Redis Append-Only File (`AOF`) and database status validation ensure pending timers survive hard crashes and restarts.
- **Strict Idempotency**: Deterministic job identifiers (`email:<jobId>`) guarantee emails are never enqueued or delivered twice.
- **Atomic Multi-Worker Rate Limiting**: Distributed Lua scripts evaluate hourly quotas across concurrent workers with zero race conditions.
- **Graceful Rollover**: Limit overflows are postponed to the next hour window preserving their original relative offsets—no jobs are ever failed or dropped.

---

## Key Capabilities

- ⚡ **Pure Delayed Job Scheduling**: Sub-second accurate future scheduling powered directly by Redis sorted sets (`wait`/`delayed` states).
- 🛡️ **Fault Tolerance & Restart Resilience**: Jobs survive worker crashes, container restarts, and network partitions. Authoritative PostgreSQL status guards prevent duplicate dispatches.
- 🚦 **Atomic Lua Rate Limiting**: Redis-evaluated atomic increments enforce both global and per-sender hourly throughput limits across multi-threaded workers.
- 📬 **Omni-Channel Transport Engine**:
  - **Resend API**: Native integration with Resend SDK supporting both Sending-Access and Full-Access API keys.
  - **Google Gmail API / OAuth 2.0**: Official Gmail API v1 direct delivery with automatic OAuth token refresh and 16-character Google App Passwords.
  - **Custom SMTP & Ethereal**: Full RFC-compliant SMTP support (SendGrid, Mailgun, AWS SES) and disposable Ethereal sandboxing with web preview URLs.
- 🔔 **Instant Slack Alerting**: Automated alerts sent via Slack OAuth / Webhooks the precise second a sender hits their hourly quota.
- 🔎 **Full-Text Email Search**: Integrated Elasticsearch indexer for instant full-text and substring searching across recipients, subjects, bodies, and statuses.
- 📊 **Queue Telemetry (Bull Board)**: Real-time telemetry dashboard mounted at `/admin/queues` displaying active, delayed, waiting, completed, and failed jobs.
- 🎨 **Next.js 15 Dark Infrastructure UI**: Sleek, responsive web dashboard with auto-polling, toast alerts, lead CSV parsing, and detailed delivery drawer.

---

## System Architecture

```text
                           ┌────────────────────────────────────────┐
                           │       Next.js 15 Web Dashboard         │
                           │  (Dark Infrastructure UI / Lucide SVG) │
                           └──────────────────┬─────────────────────┘
                                              │
                                HTTP REST / JSON Polling
                                              │
                                              ▼
                           ┌────────────────────────────────────────┐
                           │       Node.js / Express Backend        │
                           │      (TypeScript + Zod Validation)     │
                           └───────┬──────────────┬───────────┬─────┘
                                   │              │           │
                     Prisma ORM    │              │ BullMQ    │ Elasticsearch
                                   ▼              ▼           ▼
                         ┌────────────┐   ┌────────────┐   ┌──────────────┐
                         │ PostgreSQL │   │   Redis    │   │Elasticsearch │
                         │ (Authori-  │   │  (AOF +    │   │ (Full-text   │
                         │  tative)   │   │ Lua Limits)│   │  Search)     │
                         └─────┬──────┘   └─────┬──────┘   └──────────────┘
                               │                │
                               │  BullMQ Queue  │
                               │                ▼
                               │   ┌────────────────────────┐
                               │   │  BullMQ Worker Engine  │
                               └───┤ (Concurrency, Pacing, │
                                   │  Reschedule on Limit)  │
                                   └───────┬──────────┬─────┘
                                           │          │
                 ┌─────────────────────────┴────┐     │ Slack OAuth API
                 │   Omni-Channel Dispatcher    │     ▼
                 ├──────────────────────────────┤  ┌──────────────┐
                 │ • Resend API SDK             │  │ Slack Alerts │
                 │ • Google Gmail API (OAuth/App│  │ (Rate Limits)│
                 │ • Custom Outbound SMTP       │  └──────────────┘
                 │ • Ethereal Sandbox (Preview) │
                 └──────────────────────────────┘
```

---

## Project Structure

```text
Dispatchly/
├── .env.example                  # Environment configuration template
├── .gitignore                    # Git ignore rules for node, data, caches
├── docker-compose.yml            # Redis (AOF), Postgres 16, Elasticsearch
├── test-leads.csv                # Sample leads CSV for batch compose testing
├── Dispatchly_Logo.png           # Brand identity asset
│
├── backend/                      # Express + TypeScript Server & BullMQ Worker
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma         # Database models (EmailJob, Sender, User, Tenant)
│   │   ├── seed.ts               # Database seeder for demo tenants and senders
│   │   └── migrations/           # Automated SQL migration history
│   ├── scripts/                  # Automated verification and stress test suites
│   │   ├── simulate-1000-jobs.ts # 1,000+ job bulk rate limit stress simulation
│   │   ├── verify-phase4.ts      # Persistence & idempotency tests
│   │   ├── verify-phase5.ts      # Rate limiter & Redis Lua script tests
│   │   └── verify-phase11.ts     # Tables & search endpoint tests
│   └── src/
│       ├── config/               # Zod-validated environment schema
│       ├── controllers/          # Request handlers for emails, senders, auth
│       ├── db/                   # Prisma client singleton
│       ├── middlewares/          # Auth guards, error handlers, rate gates
│       ├── queues/               # BullMQ queue instantiations
│       ├── routes/               # Express router definitions
│       ├── services/             # Mailers, rate limiters, search, queue telemetry
│       ├── utils/                # Date math, parsers, and string formatting
│       └── workers/              # BullMQ distributed email worker
│
└── frontend/                     # Next.js 15 App Router Frontend
    ├── package.json
    ├── tsconfig.json
    ├── public/                   # Static UI assets and brand logos
    └── src/
        ├── app/                  # Next.js pages (Dashboard, Login, Layout)
        ├── components/           # Header, Sidebar, Toast, ThemeProvider
        ├── features/             # Feature modules:
        │   ├── auth/             # Session provider and authentication hooks
        │   ├── compose/          # Compose modal, CSV parser, timing options
        │   ├── scheduled/        # Scheduled emails table and pagination
        │   ├── senders/          # Sender management modal (Resend/Gmail/SMTP)
        │   └── sent/             # Sent emails telemetry and preview drawer
        └── lib/                  # UI utility helpers
```

---

## Quick Start Guide

### Prerequisites
- **Node.js**: v18.17.0+ or v20+
- **npm** or **yarn** / **pnpm**
- **Docker & Docker Compose**: For running Redis, PostgreSQL, and Elasticsearch locally (optional if using external instances).

---

### Step 1: Clone Repository & Configure Environment

```bash
git clone https://github.com/your-username/dispatchly.git
cd dispatchly

# Create your local environment configuration
cp .env.example .env
```

Open `.env` and configure your credentials. The default values work out-of-the-box with Docker Compose.

---

### Step 2: Launch Infrastructure (Docker)

Start PostgreSQL, Redis with Append-Only File (AOF) persistence, and Elasticsearch:

```bash
docker compose up -d
```

Verify all services are healthy:
```bash
docker compose ps
```

> **Offline Mode**: If Docker is not available in your environment, Dispatchly includes automated graceful fallbacks (in-memory job store and mock transport) ensuring development and UI testing can proceed uninterrupted.

---

### Step 3: Initialize Database & Seed Senders

```bash
cd backend
npm install

# Run database migrations
npx prisma migrate dev --name init

# Seed default tenant, test senders, and initial demo jobs
npm run db:seed
```

---

### Step 4: Run the Backend Server

```bash
cd backend
npm run dev
```

The backend server and BullMQ worker will initialize:
- **Backend API**: `http://localhost:4000/api`
- **Health Check**: `http://localhost:4000/health`
- **Bull Board Telemetry**: `http://localhost:4000/admin/queues`

---

### Step 5: Run the Frontend Dashboard

In a separate terminal window:

```bash
cd frontend
npm install
npm run dev
```

Open your browser to:
- **Web Dashboard**: `http://localhost:3000`
- **Login Screen**: `http://localhost:3000/login`

---

## Supported Email Delivery Providers

Dispatchly supports multiple real-world outbound channels:

### 1. Resend API
- Navigate to **Senders** &rarr; select **Resend API**.
- Supports both **Sending-Access** and **Full-Access** Resend API keys (`re_...`).
- **Free Sandbox Testing**: Set the From Address to `onboarding@resend.dev` (delivers directly to your Resend account email).
- **Production Outreach**: Use any custom domain verified on your [Resend Domains Dashboard](https://resend.com/domains) (e.g. `alex@yourcompany.com`).

### 2. Google Gmail (App Passwords & OAuth 2.0)
- Select the **Gmail** provider tab.
- Enter your Gmail address (e.g. `yourname@gmail.com`).
- Generate a 16-character **Google App Password**:
  1. Enable 2-Step Verification on your Google Account.
  2. Visit [Google Account &rarr; App Passwords](https://myaccount.google.com/apppasswords).
  3. Generate an App Password named "Dispatchly" and paste the 16 characters.

### 3. Custom SMTP & Ethereal Sandbox
- Connect custom SMTP relays (Mailgun, SendGrid, Amazon SES, Postmark) by specifying host, port, username, password, and SSL toggle.
- **Ethereal Mailer**: Ethereal sandbox accounts capture test emails without reaching real inboxes and generate clickable preview URLs logged in the backend terminal.

---

## Environment Variables Reference

All environment variables are validated at startup via **Zod** (`backend/src/config/env.ts`):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | HTTP port for the Express backend API and Bull Board. |
| `NODE_ENV` | `development` | Runtime environment (`development`, `production`, `test`). |
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection URL. |
| `REDIS_HOST` | `localhost` | Redis host for BullMQ queues and rate limiter. |
| `REDIS_PORT` | `6379` | Redis port. |
| `ELASTICSEARCH_URL` | `http://localhost:9200` | Elasticsearch cluster endpoint. |
| `WORKER_CONCURRENCY` | `5` | Maximum concurrent BullMQ jobs processed per worker. |
| `MIN_DELAY_MS` | `500` | Pacing delay (in milliseconds) between sends on a worker slot. |
| `MAX_EMAILS_PER_HOUR` | `500` | Global hourly rate limit across all outbound senders. |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `100` | Hourly send limit enforced per individual sender. |
| `RESEND_API_KEY` | `""` | Optional fallback global Resend API key (`re_...`). |
| `RESEND_FROM_ADDRESS` | `onboarding@resend.dev` | Default From address for Resend dispatches. |
| `SMTP_HOST` | `smtp.ethereal.email` | Outbound SMTP host. |
| `SMTP_PORT` | `587` | Outbound SMTP port. |
| `SMTP_USER` | `""` | SMTP authentication username. |
| `SMTP_PASS` | `""` | SMTP authentication password. |
| `GOOGLE_CLIENT_ID` | `""` | Google Cloud OAuth Client ID for SSO. |
| `GOOGLE_CLIENT_SECRET` | `""` | Google Cloud OAuth Client Secret. |
| `SLACK_CLIENT_ID` | `""` | Slack App Client ID for limit notifications. |
| `SLACK_CLIENT_SECRET` | `""` | Slack App Client Secret. |
| `SESSION_SECRET` | `change-me-in-production` | Secret key for signing Express session cookies. |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api` | Base API URL called by the Next.js frontend. |

---

## Deep Dive: Scheduling, Concurrency & Persistence

### 1. Pure Delayed Jobs (Zero Cron)
Dispatchly uses **BullMQ delayed jobs** exclusively:
```typescript
const delay = Math.max(0, scheduledFor.getTime() - Date.now());
await emailQueue.add(
  'send-email',
  { emailJobId: job.id },
  {
    jobId: `email:${job.id}`,
    delay,
    removeOnComplete: true,
  }
);
```
Timers are managed natively inside Redis sorted sets. Redis handles millisecond-level offsets and automatically transitions delayed jobs to the `waiting` state when target timestamps are reached.

### 2. Redis AOF (Append-Only File) Persistence
`docker-compose.yml` configures Redis with `--appendonly yes`:
```yaml
command: ["redis-server", "--appendonly", "yes"]
volumes:
  - redisdata:/data
```
Every job scheduled is synced to disk. If the Redis server or worker container restarts, Redis replays the AOF log and reconstructs pending timers without losing a single job.

### 3. Deterministic Idempotency & Database Locks
Jobs are enqueued with deterministic IDs: `jobId: email:${emailJob.id}`. BullMQ deduplicates any duplicate enqueue attempts natively. Furthermore, before dispatching, the worker validates status against PostgreSQL:
```typescript
const freshJob = await prisma.emailJob.findUnique({ where: { id: emailJobId } });
if (!freshJob || freshJob.status === EmailStatus.SENT) {
  return; // Already processed — safe idempotent exit
}
```

---

## Deep Dive: Atomic Rate Limiting & Overflows

### 1. Distributed Atomic Redis Lua Script
Rate limiting uses atomic Redis Lua evaluation to eliminate race conditions between concurrent worker threads:
- **Sender Quota Key**: `ratelimit:<senderId>:<YYYY-MM-DD-HH>`
- **Global Quota Key**: `ratelimit:global:<YYYY-MM-DD-HH>`

```lua
local currentSender = redis.call('INCR', senderKey)
if currentSender == 1 then
  redis.call('EXPIRE', senderKey, 7200)
end
if currentSender > tonumber(senderLimit) then
  return { 0, currentSender, tonumber(senderLimit), msUntilNextHour }
end
```

### 2. Order-Preserving Rollover (Zero Dropped Jobs)
When a sender or global limit is exceeded:
1. The worker calculates the start of the next calendar hour window (`getNextRunTimestamp`), retaining the job's minute and second offset.
2. The database updates `scheduledFor` with the new timestamp.
3. The worker re-enqueues the job via BullMQ's `moveToDelayed`:
   ```typescript
   await job.moveToDelayed(nextRunTimestamp, token);
   throw new DelayedError();
   ```
The job transitions back into the delayed set without failing or counting toward retry limits.

---

## REST API Specification

### Email Endpoints
- `POST /api/emails/schedule` — Schedule an email job (single or batch leads).
- `GET /api/emails?status=SCHEDULED` — List pending scheduled emails (supports pagination and search query `q=`).
- `GET /api/emails?status=SENT` — List delivered and failed email records.
- `GET /api/emails/:id` — Inspect full email metadata, payload, recipient, and delivery logs.
- `DELETE /api/emails/:id` — Cancel a pending scheduled email and remove it from the BullMQ queue.

### Sender Management
- `GET /api/emails/senders` — List configured sender identities.
- `POST /api/emails/senders` — Connect a new outbound sender (Resend, Gmail, or SMTP).
- `POST /api/emails/senders/verify` — Test sender credentials in real-time.
- `DELETE /api/emails/senders/:id` — Disconnect a sender identity.

### System & Telemetry
- `GET /health` — Server health, Redis connectivity, and uptime metrics.
- `GET /admin/queues` — Interactive Bull Board queue telemetry dashboard.

---

## Verification & Automated Test Suite

Dispatchly includes automated end-to-end verification scripts:

```bash
cd backend

# 1. 1,000+ Job Bulk Simulation & Rate Limiter Stress Test
npm run stress:1000

# 2. Persistence & Idempotency Verification
npm run verify:phase4

# 3. Atomic Rate Limiting & Concurrency Verification
npm run verify:phase5

# 4. Slack OAuth & Limit Alert Verification
npm run verify:phase8

# 5. Tables & Full-Text Search Verification
npm run verify:phase11

# 6. Typecheck and Compile Verification
npm run build
```

---

## License

This project is licensed under the [MIT License](LICENSE).
