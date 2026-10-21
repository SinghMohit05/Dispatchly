"use client";

import React, { useEffect, useState } from "react";
import { X, AlertCircle } from "lucide-react";

export interface EmailJobDetail {
  id: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledFor: string;
  sentAt?: string | null;
  status: "SCHEDULED" | "SENT" | "FAILED";
  error?: string | null;
  createdAt: string;
  sender?: {
    fromAddress?: string;
  } | null;
}

interface EmailDetailModalProps {
  email: EmailJobDetail | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function EmailDetailModal({
  email,
  isOpen,
  onClose,
}: EmailDetailModalProps) {
  const [viewMode, setViewMode] = useState<"preview" | "source">("preview");

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !email) return null;

  const senderDisplay =
    email.sender?.fromAddress || email.senderId || "seed-sender-01";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150 font-sans">
      <div
        className="relative w-full max-w-3xl rounded-[10px] border border-[#D8DEE6] dark:border-[#22272E] bg-white dark:bg-[#111418] p-6 shadow-2xl text-[#111418] dark:text-[#F2F3F5] my-8 space-y-5 transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#E6EAF0] dark:border-[#22272E] pb-4">
          <div className="space-y-1.5 pr-6">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#7A8594] dark:text-[#6F7782]">
                Email Job Inspector
              </span>
              {email.status === "SCHEDULED" && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] font-mono text-[10px] bg-[#FEF8EC] dark:bg-[#E8B44C]/10 text-[#B45309] dark:text-[#E8B44C] border border-[#FDE68A] dark:border-[#E8B44C]/25 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#B45309] dark:bg-[#E8B44C]" />
                  SCHEDULED
                </span>
              )}
              {email.status === "SENT" && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] font-mono text-[10px] bg-[#F0FDF4] dark:bg-[#35C98A]/10 text-[#16A34A] dark:text-[#35C98A] border border-[#BBF7D0] dark:border-[#35C98A]/25 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A] dark:bg-[#35C98A]" />
                  DELIVERED
                </span>
              )}
              {email.status === "FAILED" && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] font-mono text-[10px] bg-[#FEF2F2] dark:bg-[#EF5B68]/10 text-[#EF5B68] border border-[#FECACA] dark:border-[#EF5B68]/25 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#EF5B68]" />
                  FAILED
                </span>
              )}
            </div>
            <h2 className="text-base font-bold text-[#111418] dark:text-[#F2F3F5] tracking-tight break-words">
              {email.subject}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] bg-[#F8F9FB] dark:bg-[#15191E] hover:bg-[#EEF1F5] dark:hover:bg-[#1A1F25] p-1.5 text-[#4E5764] dark:text-[#A1A7B0] hover:text-[#111418] dark:hover:text-[#F2F3F5] transition-colors cursor-pointer shrink-0 flex items-center justify-center"
            title="Close inspector"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* Metadata Telemetry Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-[#F8F9FB] dark:bg-[#0D0F12] p-4 rounded-[8px] border border-[#E6EAF0] dark:border-[#1A1F25]">
          <div>
            <span className="text-[#7A8594] dark:text-[#6F7782] block font-medium mb-1 text-[11px]">
              Recipient
            </span>
            <span className="text-[#111418] dark:text-[#F2F3F5] font-mono text-xs select-all break-all font-medium">
              {email.recipient}
            </span>
          </div>

          <div>
            <span className="text-[#7A8594] dark:text-[#6F7782] block font-medium mb-1 text-[11px]">
              From Sender
            </span>
            <span className="text-[#111418] dark:text-[#F2F3F5] font-mono text-xs select-all break-all">
              {senderDisplay}
            </span>
          </div>

          <div>
            <span className="text-[#7A8594] dark:text-[#6F7782] block font-medium mb-1 text-[11px]">
              Scheduled For
            </span>
            <span className="text-[#4E5764] dark:text-[#A1A7B0] font-mono text-xs">
              {new Date(email.scheduledFor).toLocaleString()}
            </span>
          </div>

          <div>
            <span className="text-[#7A8594] dark:text-[#6F7782] block font-medium mb-1 text-[11px]">
              {email.status === "SENT" ? "Delivered At" : "Created At"}
            </span>
            <span className="text-[#4E5764] dark:text-[#A1A7B0] font-mono text-xs">
              {(() => {
                const dateVal =
                  email.status === "SENT" && email.sentAt
                    ? email.sentAt
                    : email.createdAt || email.scheduledFor;
                if (!dateVal) return "Just now";
                const d = new Date(dateVal);
                return isNaN(d.getTime()) ? "Just now" : d.toLocaleString();
              })()}
            </span>
          </div>

          <div>
            <span className="text-[#7A8594] dark:text-[#6F7782] block font-medium mb-1 text-[11px]">
              Database Record ID
            </span>
            <span className="text-[#7A8594] dark:text-[#6F7782] font-mono select-all text-[11px]">
              {email.id}
            </span>
          </div>

          <div>
            <span className="text-[#7A8594] dark:text-[#6F7782] block font-medium mb-1 text-[11px]">
              Queue Job ID
            </span>
            <span className="text-[#7A8594] dark:text-[#6F7782] font-mono select-all text-[11px]">
              email:{email.id}
            </span>
          </div>
        </div>

        {/* Failure Error Alert if applicable */}
        {email.error && (
          <div className="rounded-[10px] border border-[#EF5B68]/30 bg-[#EF5B68]/10 p-3.5 text-xs text-[#EF5B68] space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={16} strokeWidth={1.75} className="text-[#EF5B68] mt-0.5 shrink-0" />
              <div className="flex-1">
                <span className="font-semibold block text-[#EF5B68]">
                  Delivery Error Log:
                </span>
                <p className="mt-0.5 font-mono text-[11px] break-all text-[#EF5B68]">
                  {email.error}
                </p>
              </div>
            </div>

            {email.error.includes("insufficient authentication scopes") && (
              <div className="rounded-[8px] border border-amber-500/40 bg-white dark:bg-[#161A22] p-3 text-amber-800 dark:text-amber-200 space-y-2">
                <p className="font-semibold text-xs text-amber-700 dark:text-amber-300">
                  Why this happened &amp; How to resolve:
                </p>
                <p className="text-[11px] text-[#4E5764] dark:text-[#A1A7B0] leading-relaxed">
                  Google requires outbound permission to send emails. When connecting Google, the permission checkbox is <strong>unchecked by default</strong>. You must check it:
                </p>
                <div className="inline-flex items-center gap-2 font-mono text-[10.5px] bg-[#F8F9FB] dark:bg-[#0D0F12] px-2.5 py-1 rounded border border-amber-500/30 text-amber-900 dark:text-amber-100 font-semibold">
                  <span className="h-3.5 w-3.5 rounded bg-blue-600 flex items-center justify-center text-white text-[9px] font-bold">✓</span>
                  <span>Send email on your behalf</span>
                </div>
                <div>
                  <a
                    href="http://localhost:4000/api/auth/google?action=connect_sender"
                    className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 text-xs font-semibold mt-1 transition-all shadow-xs cursor-pointer"
                  >
                    <span>Reconnect Google &amp; Check Permission</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Message Body Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#111418] dark:text-[#F2F3F5]">
              Message Content
            </span>
            <div className="flex items-center gap-1 rounded-[6px] bg-[#EAEFF5] dark:bg-[#0D0F12] p-0.5 border border-[#D8DEE6] dark:border-[#22272E] text-[11px]">
              <button
                type="button"
                onClick={() => setViewMode("preview")}
                className={`px-2.5 py-1 rounded-[4px] text-xs font-medium transition-all cursor-pointer ${
                  viewMode === "preview"
                    ? "bg-white dark:bg-white text-[#111418] dark:text-[#090A0C] font-semibold shadow-xs"
                    : "text-[#4E5764] dark:text-[#A1A7B0] hover:text-[#111418] dark:hover:text-[#F2F3F5]"
                }`}
              >
                HTML Preview
              </button>
              <button
                type="button"
                onClick={() => setViewMode("source")}
                className={`px-2.5 py-1 rounded-[4px] text-xs font-medium transition-all cursor-pointer ${
                  viewMode === "source"
                    ? "bg-white dark:bg-white text-[#111418] dark:text-[#090A0C] font-semibold shadow-xs"
                    : "text-[#4E5764] dark:text-[#A1A7B0] hover:text-[#111418] dark:hover:text-[#F2F3F5]"
                }`}
              >
                Raw Source
              </button>
            </div>
          </div>

          <div className="rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] bg-[#F8F9FB] dark:bg-[#0D0F12] p-4 max-h-60 overflow-y-auto text-xs">
            {viewMode === "preview" ? (
              <div
                className="prose dark:prose-invert max-w-none text-[#111418] dark:text-[#F2F3F5] leading-relaxed space-y-2"
                dangerouslySetInnerHTML={{ __html: email.body }}
              />
            ) : (
              <pre className="font-mono text-[#4E5764] dark:text-[#A1A7B0] whitespace-pre-wrap break-all text-[11px]">
                {email.body}
              </pre>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[#E6EAF0] dark:border-[#22272E] text-xs">
          <span className="text-[#7A8594] dark:text-[#6F7782] font-mono text-[11px]">
            ESC to dismiss
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] bg-[#F8F9FB] dark:bg-[#15191E] hover:bg-[#EEF1F5] dark:hover:bg-[#1A1F25] px-4 py-2 font-medium text-[#111418] dark:text-[#F2F3F5] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
