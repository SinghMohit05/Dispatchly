"use client";

import React, { useState, useEffect, useRef } from "react";
import { API_BASE_URL } from "../auth";
import { useToast } from "../../components/Toast";
import {
  CalendarClock,
  X,
  AlertCircle,
  CheckCircle2,
  Upload,
  Clock,
  Plus,
} from "lucide-react";
import { SenderModal } from "../senders";

interface SenderItem {
  id: string;
  tenantId: string;
  fromAddress: string;
  name?: string;
  type?: string;
  isConfigured?: boolean;
}

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export default function ComposeModal({
  isOpen,
  onClose,
  onSuccess,
}: ComposeModalProps) {
  const toast = useToast();
  const [senders, setSenders] = useState<SenderItem[]>([]);
  const [senderId, setSenderId] = useState<string>("seed-sender-01");
  const [showSenderModal, setShowSenderModal] = useState<boolean>(false);
  const [subject, setSubject] = useState<string>("");
  const [body, setBody] = useState<string>(
    "Hi {{firstName}},\n\nI came across your outbound engine setup at {{company}} and wanted to share how our BullMQ distributed scheduler minimizes delivery jitter.\n\nBest regards,\nAlex Rivera"
  );

  // Delivery Timing: Start time, delay, and hourly limit
  const [startTime, setStartTime] = useState<string>(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 16);
  });
  const [delaySeconds, setDelaySeconds] = useState<number>(5);
  const [hourlyLimit, setHourlyLimit] = useState<number>(50);

  // Recipient input & parsing
  const [inputMode, setInputMode] = useState<"file" | "manual">("file");
  const [parsedRecipients, setParsedRecipients] = useState<string[]>([]);
  const [manualText, setManualText] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Status states
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadSenders = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/emails/senders`, {
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.data) && json.data.length > 0) {
          setSenders(json.data);
          setSenderId(json.data[0].id);
        }
      }
    } catch {
      // Fallback default
      setSenders([
        {
          id: "seed-sender-01",
          tenantId: "tenant-default",
          fromAddress: "dispatcher@dispatchly.test",
          type: "ethereal",
        },
      ]);
    }
  };

  // Load configured senders from backend
  useEffect(() => {
    if (!isOpen) return;
    loadSenders();
  }, [isOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessMsg(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  // Parse recipient lines
  const parseLeadsFromText = (raw: string) => {
    const matches = raw.match(EMAIL_REGEX);
    if (!matches) {
      setParsedRecipients([]);
      return;
    }
    const unique = Array.from(new Set(matches.map((e) => e.trim().toLowerCase())));
    setParsedRecipients(unique);
  };

  const handleFileChange = (file: File) => {
    setFileError(null);
    setFileName(file.name);

    if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt")) {
      const msg = "Please upload a valid .csv or .txt lead file.";
      setFileError(msg);
      toast.warning(msg, "Invalid File Type");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        parseLeadsFromText(content);
      }
    };
    reader.onerror = () => {
      const msg = "Failed to read file in browser.";
      setFileError(msg);
      toast.error(msg, "File Read Error");
    };
    reader.readAsText(file);
  };

  const handleManualTextChange = (val: string) => {
    setManualText(val);
    parseLeadsFromText(val);
  };

  const insertVariable = (token: string) => {
    setBody((prev) => `${prev} ${token}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (parsedRecipients.length === 0) {
      const msg = "Please provide at least one valid recipient email address.";
      setError(msg);
      toast.warning(msg, "Missing Recipients");
      return;
    }

    if (!subject.trim()) {
      const msg = "Subject line is required.";
      setError(msg);
      toast.warning(msg, "Subject Required");
      return;
    }

    if (!body.trim()) {
      const msg = "Email body content is required.";
      setError(msg);
      toast.warning(msg, "Body Required");
      return;
    }

    setSubmitting(true);

    try {
      const scheduledDate = startTime ? new Date(startTime) : new Date();

      const payload = {
        senderId,
        recipients: parsedRecipients,
        subject: subject.trim(),
        body: body.trim(),
        startTime: scheduledDate.toISOString(),
        delaySeconds: Number(delaySeconds) || 0,
        hourlyLimit: hourlyLimit ? Number(hourlyLimit) : undefined,
      };

      const res = await fetch(`${API_BASE_URL}/api/emails/schedule`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(
          json?.error?.message || "Failed to schedule email campaign."
        );
      }

      const count = json.data?.count || (json.data?.id ? 1 : parsedRecipients.length);

      setSuccessMsg(`Successfully scheduled ${count} email(s) into delayed queue!`);

      toast.success(
        `Scheduled ${count} email dispatch(es) across BullMQ delayed queue.`,
        "Campaign Queued"
      );

      onSuccess();

      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while scheduling.";
      setError(msg);
      toast.error(msg, "Scheduling Failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/75 backdrop-blur-xs p-4 overflow-y-auto font-sans">
      <div className="relative w-full max-w-2xl rounded-[12px] border border-[#D8DEE6] dark:border-[#22272E] bg-white dark:bg-[#111418] p-6 shadow-2xl text-[#111418] dark:text-[#F2F3F5] my-8 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E6EAF0] dark:border-[#1A1F25] pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[7px] bg-[#F4F6F8] dark:bg-[#16191F] border border-[#D8DEE6] dark:border-[#262B34] text-[#111418] dark:text-white">
              <CalendarClock size={16} strokeWidth={1.8} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#111418] dark:text-[#F2F3F5] tracking-tight">
                Compose Outbound Dispatch
              </h2>
              <p className="text-[11px] text-[#7A8594] dark:text-[#6F7782]">
                Configure sender identity, audience, personalization, and scheduling.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-[6px] p-1.5 text-[#7A8594] dark:text-[#6F7782] hover:bg-[#F0F3F7] dark:hover:bg-[#15191E] hover:text-[#111418] dark:hover:text-[#F2F3F5] transition-colors cursor-pointer flex items-center justify-center"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        {/* Notifications */}
        {error && (
          <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-500 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle size={16} strokeWidth={1.75} className="text-rose-500 dark:text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 size={16} strokeWidth={1.75} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Sender & Start Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Sender Select */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[#4E5764] dark:text-[#A1A7B0] font-medium text-[11px]">
                  From Sender
                </label>
                <button
                  type="button"
                  onClick={() => setShowSenderModal(true)}
                  className="text-[11px] text-[#7C3AED] dark:text-[#A78BFA] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={11} strokeWidth={2.5} />
                  Connect Real Sender
                </button>
              </div>

              <div className="relative">
                <select
                  value={senderId}
                  onChange={(e) => setSenderId(e.target.value)}
                  className="w-full rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] bg-[#F8F9FB] dark:bg-[#0D0F12] px-3 py-2 text-[#111418] dark:text-[#F2F3F5] focus:border-[#7C3AED] dark:focus:border-white/50 focus:outline-none transition-colors pr-8 text-xs cursor-pointer"
                >
                  {senders.map((s) => {
                    const isReal = s.isConfigured && s.id !== "seed-sender-01";
                    return (
                      <option key={s.id} value={s.id}>
                        {isReal ? "🟢 " : "🟡 "}
                        {s.fromAddress} {s.name ? `(${s.name})` : ""} — {isReal ? `[${(s.type || "SMTP").toUpperCase()}]` : "[Simulator]"}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Start Time */}
            <div>
              <label className="block text-[#4E5764] dark:text-[#A1A7B0] font-medium text-[11px] mb-1">
                Start Time
              </label>
              <div className="relative">
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] bg-[#F8F9FB] dark:bg-[#0D0F12] px-3 py-2 text-[#111418] dark:text-[#F2F3F5] focus:border-[#7C3AED] dark:focus:border-white/50 focus:outline-none transition-colors font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* Lead Recipients Section */}
          <div className="rounded-[10px] border border-[#D8DEE6] dark:border-[#22272E] bg-[#F8F9FB] dark:bg-[#0D0F12] p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#111418] dark:text-[#F2F3F5] flex items-center gap-1.5">
                Audience &amp; Recipients
                <span className="font-mono text-[9.5px] px-1.5 py-0.2 rounded bg-[#EAEFF5] dark:bg-[#16191F] border border-[#D8DEE6] dark:border-[#22272E] text-[#16A34A] dark:text-[#35C98A] font-semibold">
                  CSV / TXT / Manual
                </span>
              </span>

              <div className="flex items-center gap-1 rounded-[6px] bg-[#EAEFF5] dark:bg-[#111418] p-0.5 border border-[#D8DEE6] dark:border-[#22272E]">
                <button
                  type="button"
                  onClick={() => setInputMode("file")}
                  className={`px-2.5 py-1 rounded-[4px] text-[10px] font-medium transition-colors cursor-pointer ${
                    inputMode === "file"
                      ? "bg-white dark:bg-[#1C2028] text-[#111418] dark:text-[#F2F3F5] border border-[#D8DEE6] dark:border-[#2D333F] shadow-xs"
                      : "text-[#7A8594] dark:text-[#6F7782] hover:text-[#111418] dark:hover:text-[#F2F3F5]"
                  }`}
                >
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("manual")}
                  className={`px-2.5 py-1 rounded-[4px] text-[10px] font-medium transition-colors cursor-pointer ${
                    inputMode === "manual"
                      ? "bg-white dark:bg-[#1C2028] text-[#111418] dark:text-[#F2F3F5] border border-[#D8DEE6] dark:border-[#2D333F] shadow-xs"
                      : "text-[#7A8594] dark:text-[#6F7782] hover:text-[#111418] dark:hover:text-[#F2F3F5]"
                  }`}
                >
                  Manual Entry
                </button>
              </div>
            </div>

            {inputMode === "file" && (
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv,.txt,text/plain,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileChange(f);
                  }}
                />

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleFileChange(f);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center rounded-[8px] border border-dashed p-4 text-center cursor-pointer transition-colors ${
                    isDragging
                      ? "border-[#111418] dark:border-white bg-[#F0F3F7] dark:bg-[#16191F]"
                      : "border-[#CCD3DE] dark:border-[#22272E] hover:border-[#111418] dark:hover:border-[#353C47] bg-white dark:bg-[#111418]"
                  }`}
                >
                  <Upload size={22} strokeWidth={1.8} className="text-[#4E5764] dark:text-[#A1A7B0] mb-1.5" />
                  <p className="font-medium text-[#111418] dark:text-[#F2F3F5] text-xs">
                    Drop CSV or TXT lead list, or click to browse
                  </p>
                  <p className="text-[10px] text-[#7A8594] dark:text-[#6F7782] mt-0.5">
                    Parsed directly in browser
                  </p>
                </div>
              </div>
            )}

            {inputMode === "manual" && (
              <textarea
                rows={3}
                value={manualText}
                onChange={(e) => handleManualTextChange(e.target.value)}
                placeholder="Paste email addresses (e.g. lead1@example.com, lead2@example.com)..."
                className="w-full rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] bg-white dark:bg-[#111418] p-2.5 text-[#111418] dark:text-[#F2F3F5] placeholder-[#7A8594] dark:placeholder-[#6F7782] focus:border-[#7C3AED] dark:focus:border-white/50 focus:outline-none font-mono text-xs"
              />
            )}

            {fileError && <p className="text-[10px] text-[#EF5B68]">{fileError}</p>}

            {parsedRecipients.length > 0 && (
              <div className="rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] bg-white dark:bg-[#111418] p-2.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[10px] text-[#16A34A] dark:text-[#35C98A] font-medium flex items-center gap-1.5">
                    <CheckCircle2 size={12} />
                    {fileName || "leads"}: {parsedRecipients.length} recipient(s) ready
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setParsedRecipients([]);
                      setFileName("");
                      setManualText("");
                    }}
                    className="text-[10px] text-[#7A8594] dark:text-[#6F7782] hover:text-[#EF5B68] cursor-pointer"
                  >
                    Clear
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                  {parsedRecipients.slice(0, 6).map((email) => (
                    <span
                      key={email}
                      className="font-mono text-[10px] px-2 py-0.5 rounded-[4px] bg-[#F0F3F7] dark:bg-[#16191F] border border-[#D8DEE6] dark:border-[#22272E] text-[#4E5764] dark:text-[#A1A7B0]"
                    >
                      {email}
                    </span>
                  ))}
                  {parsedRecipients.length > 6 && (
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded-[4px] bg-[#F0F3F7] dark:bg-[#16191F] text-[#7A8594] dark:text-[#6F7782]">
                      +{parsedRecipients.length - 6} more...
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Subject Line */}
          <div>
            <label className="block text-[#4E5764] dark:text-[#A1A7B0] font-medium mb-1 text-[11px]">
              Email Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Scaling outbound infrastructure with Dispatchly"
              className="w-full rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] bg-[#F8F9FB] dark:bg-[#0D0F12] px-3 py-2 text-[#111418] dark:text-[#F2F3F5] placeholder-[#7A8594] dark:placeholder-[#6F7782] focus:border-[#7C3AED] dark:focus:border-white/50 focus:outline-none transition-colors"
            />
          </div>

          {/* Body with Token Insertion */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-[#4E5764] dark:text-[#A1A7B0] font-medium text-[11px]">
                Message Body
              </label>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-[#7A8594] dark:text-[#6F7782] mr-1">Tokens:</span>
                <button
                  type="button"
                  onClick={() => insertVariable("{{firstName}}")}
                  className="font-mono text-[9.5px] px-1.5 py-0.2 rounded bg-[#F0F3F7] dark:bg-[#16191F] hover:bg-[#E2E7EE] dark:hover:bg-[#20252E] text-[#111418] dark:text-[#F2F3F5] border border-[#D8DEE6] dark:border-[#22272E] transition-colors cursor-pointer"
                >
                  + &#123;&#123;firstName&#125;&#125;
                </button>
                <button
                  type="button"
                  onClick={() => insertVariable("{{company}}")}
                  className="font-mono text-[9.5px] px-1.5 py-0.2 rounded bg-[#F0F3F7] dark:bg-[#16191F] hover:bg-[#E2E7EE] dark:hover:bg-[#20252E] text-[#111418] dark:text-[#F2F3F5] border border-[#D8DEE6] dark:border-[#22272E] transition-colors cursor-pointer"
                >
                  + &#123;&#123;company&#125;&#125;
                </button>
              </div>
            </div>

            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] bg-[#F8F9FB] dark:bg-[#0D0F12] p-3 text-[#111418] dark:text-[#F2F3F5] placeholder-[#7A8594] dark:placeholder-[#6F7782] focus:border-[#7C3AED] dark:focus:border-white/50 focus:outline-none font-sans leading-relaxed"
            />
          </div>

          {/* Pacing Controls: Delay between emails and Hourly Limit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-[10px] border border-[#D8DEE6] dark:border-[#22272E] bg-[#F8F9FB] dark:bg-[#0D0F12] p-3">
            <div>
              <label className="block text-[#4E5764] dark:text-[#A1A7B0] font-medium mb-1 text-[11px]">
                Delay Between Emails (seconds)
              </label>
              <input
                type="number"
                min="0"
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] bg-white dark:bg-[#111418] px-3 py-1.5 text-[#111418] dark:text-[#F2F3F5] focus:border-[#7C3AED] dark:focus:border-white/50 focus:outline-none font-mono"
              />
              <p className="text-[9.5px] text-[#7A8594] dark:text-[#6F7782] mt-0.5">
                Staggers sends: +{delaySeconds}s, +{delaySeconds * 2}s...
              </p>
            </div>

            <div>
              <label className="block text-[#4E5764] dark:text-[#A1A7B0] font-medium mb-1 text-[11px]">
                Hourly Limit (max/hr)
              </label>
              <input
                type="number"
                min="1"
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] bg-white dark:bg-[#111418] px-3 py-1.5 text-[#111418] dark:text-[#F2F3F5] focus:border-[#7C3AED] dark:focus:border-white/50 focus:outline-none font-mono"
              />
              <p className="text-[9.5px] text-[#7A8594] dark:text-[#6F7782] mt-0.5">
                Defers into next hour window on cap.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E6EAF0] dark:border-[#1A1F25]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-full border border-[#D8DEE6] dark:border-[#22272E] bg-[#F8F9FB] dark:bg-[#16191F] hover:bg-[#EEF1F5] dark:hover:bg-[#1D222B] px-4 py-2 text-xs font-medium text-[#4E5764] dark:text-[#A1A7B0] hover:text-[#111418] dark:hover:text-[#F2F3F5] transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting || parsedRecipients.length === 0}
              className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-semibold text-white dark:text-[#090A0C] bg-[#111418] dark:bg-white hover:bg-[#1F242C] dark:hover:bg-[#E2E4E9] shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {submitting ? (
                <>
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  <span>Queueing {parsedRecipients.length} Dispatches...</span>
                </>
              ) : (
                <>
                  <CalendarClock size={14} strokeWidth={2.4} />
                  <span>
                    Schedule {parsedRecipients.length > 0 ? `${parsedRecipients.length} Email(s)` : "Batch"}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <SenderModal
        isOpen={showSenderModal}
        onClose={() => setShowSenderModal(false)}
        onSenderAdded={(newId) => {
          loadSenders();
          if (newId) setSenderId(newId);
        }}
      />
    </div>
  );
}
