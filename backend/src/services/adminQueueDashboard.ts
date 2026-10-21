import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter.js";
import { ExpressAdapter } from "@bull-board/express";
import { emailQueue } from "../queues/emailQueue.js";

// ── Bull Board Express Adapter Setup ─────────────────────────

export const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

// Mount the email-jobs queue from Phase 3 into the Bull Board dashboard
createBullBoard({
  queues: [new BullMQAdapter(emailQueue) as any],
  serverAdapter,
});

export const bullBoardRouter = serverAdapter.getRouter();
