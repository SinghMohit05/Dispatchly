import { Router } from "express";
import {
  handleScheduleEmail,
  handleListSenders,
  handleCreateSender,
  handleVerifySender,
  handleDeleteSender,
  handleListEmails,
  handleGetEmail,
  handleSearchEmails,
  handleClearAllEmails,
} from "../controllers/emailController.js";

const router = Router();

// POST /api/emails/schedule — create + enqueue a delayed email job (single or batch)
router.post("/schedule", handleScheduleEmail);

// Senders management
router.get("/senders", handleListSenders);
router.post("/senders", handleCreateSender);
router.post("/senders/verify", handleVerifySender);
router.delete("/senders/:id", handleDeleteSender);

// GET  /api/emails/search   — search across subject, recipient, and body
router.get("/search", handleSearchEmails);

// GET  /api/emails          — list jobs (optional ?status=SCHEDULED|SENT|FAILED)
router.get("/", handleListEmails);

// DELETE /api/emails         — clear ALL email jobs from all stores
router.delete("/", handleClearAllEmails);

// GET  /api/emails/:id      — get a single job by ID
router.get("/:id", handleGetEmail);

export default router;
