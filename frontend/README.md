# Dispatchly — Frontend Dashboard

High-fidelity Next.js 15 web dashboard for **Dispatchly** email orchestration.

## Features
- **Modern Infrastructure UI**: Dark and light mode themes, Inter typography, Lucide SVG iconography.
- **Scheduled & Sent Tables**: Real-time email status tables with automatic 4-second background refresh.
- **Compose & Batch Ingestion**: Rich compose modal with variable tags (`{{firstName}}`, `{{company}}`), CSV lead file import, and staggered delivery spacing.
- **Omni-Channel Sender Modal**: Connect and verify **Resend API**, **Google Gmail** (App Passwords / OAuth 2.0), or **Custom SMTP** credentials.
- **Full-Text Search**: Live substring filtering across recipient, subject, and body fields.
- **Email Detail Drawer**: Slide-out inspection drawer viewing raw HTML, rendered body, timing offsets, and error telemetry.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the dashboard.

## Tech Stack
- **Next.js 15** (App Router)
- **React 19**
- **Tailwind CSS**
- **Lucide React**
- **TypeScript** (Strict Mode)
