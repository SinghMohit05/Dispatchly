"use client";

import React from "react";
import { EmailJobDetail } from "../../components/EmailDetailModal";
import {
  CalendarClock,
  Eye,
  Plus,
  Search,
} from "lucide-react";

interface ScheduledTableProps {
  emails: EmailJobDetail[];
  loading: boolean;
  onSelectEmail: (email: EmailJobDetail) => void;
  onComposeClick?: () => void;
  searchQuery?: string;
}

export default function ScheduledTable({
  emails,
  loading,
  onSelectEmail,
  onComposeClick,
  searchQuery,
}: ScheduledTableProps) {
  // ── Loading Skeleton Rows ──
  if (loading) {
    return (
      <div className="divide-y divide-[#E6EAF0] dark:divide-[#22272E] animate-pulse font-sans">
        {[1, 2, 3, 4, 5].map((idx) => (
          <div
            key={idx}
            className="flex items-center justify-between py-4 px-4 bg-white dark:bg-[#111418]"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-[6px] bg-[#EAEFF5] dark:bg-[#15191E]" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-48 rounded bg-[#EAEFF5] dark:bg-[#15191E]" />
                <div className="h-2.5 w-64 rounded bg-[#EAEFF5] dark:bg-[#15191E]" />
              </div>
            </div>
            <div className="hidden sm:block h-3 w-32 rounded bg-[#EAEFF5] dark:bg-[#15191E]" />
            <div className="h-3 w-28 rounded bg-[#EAEFF5] dark:bg-[#15191E]" />
            <div className="h-6 w-20 rounded-[6px] bg-[#EAEFF5] dark:bg-[#15191E]" />
            <div className="h-7 w-16 rounded-[6px] bg-[#EAEFF5] dark:bg-[#15191E]" />
          </div>
        ))}
      </div>
    );
  }

  // ── Empty State ──
  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center font-sans">
        <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#F8F9FB] dark:bg-[#15191E] border border-[#D8DEE6] dark:border-[#22272E] text-[#4E5764] dark:text-[#A1A7B0] mb-3">
          {searchQuery ? (
            <Search size={18} strokeWidth={1.75} className="text-[#4E5764] dark:text-[#A1A7B0]" />
          ) : (
            <CalendarClock size={20} strokeWidth={1.75} />
          )}
        </div>

        <h3 className="text-sm font-semibold text-[#111418] dark:text-[#F2F3F5]">
          {searchQuery
            ? "No matching scheduled dispatches"
            : "No scheduled emails in queue"}
        </h3>

        <p className="mt-1 text-xs leading-relaxed text-[#7A8594] dark:text-[#6F7782] max-w-[360px]">
          {searchQuery
            ? `No scheduled email jobs matched "${searchQuery}". Try searching by a different recipient address or subject line.`
            : "When you schedule emails via Compose or the API, they will appear here."}
        </p>

        {!searchQuery && (
          <button
            type="button"
            onClick={onComposeClick}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#111418] dark:bg-white hover:bg-[#1F242C] dark:hover:bg-[#E2E4E9] px-4 py-2 text-xs font-semibold text-white dark:text-[#090A0C] shadow-xs transition-all cursor-pointer active:scale-[0.98]"
          >
            <Plus size={14} strokeWidth={2.4} className="text-white dark:text-[#090A0C]" />
            <span>Schedule Email</span>
          </button>
        )}
      </div>
    );
  }

  // ── Scheduled Emails Table ──
  return (
    <div className="overflow-x-auto w-full font-sans">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="bg-[#F8F9FB] dark:bg-[#0D0F12] border-b border-[#D8DEE6] dark:border-[#22272E] text-[#7A8594] dark:text-[#6F7782] font-mono text-[10px] uppercase tracking-wider font-semibold">
            <th className="py-3 px-4">Recipient</th>
            <th className="py-3 px-4">Subject</th>
            <th className="py-3 px-4 hidden md:table-cell">From Sender</th>
            <th className="py-3 px-4">Scheduled For</th>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E6EAF0] dark:divide-[#1A1F25] text-[#4E5764] dark:text-[#A1A7B0]">
          {emails.map((job) => {
            const senderDisplay =
              job.sender?.fromAddress || job.senderId || "seed-sender-01";
            const scheduledDate = new Date(job.scheduledFor);
            const domain = job.recipient.split("@")[1] || "domain";
            const leadId = `#JB-${job.id.slice(-5).toUpperCase()}`;

            return (
              <tr
                key={job.id}
                onClick={() => onSelectEmail(job)}
                className="hover:bg-[#F8F9FB] dark:hover:bg-[#15191E] transition-colors cursor-pointer group h-12"
              >
                {/* Recipient */}
                <td className="py-2.5 px-4 font-medium text-[#111418] dark:text-[#F2F3F5]">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[#F0F3F7] dark:bg-[#0D0F12] text-[10px] font-mono font-semibold text-[#111418] dark:text-[#F2F3F5] border border-[#D8DEE6] dark:border-[#22272E]">
                      {job.recipient.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-[#111418] dark:text-[#F2F3F5] truncate max-w-[200px]">
                        {job.recipient}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-[#F0F3F7] dark:bg-[#0D0F12] text-[#7A8594] dark:text-[#6F7782] border border-[#E6EAF0] dark:border-[#1A1F25]">
                          {domain}
                        </span>
                        <span className="font-mono text-[9px] text-[#7A8594] dark:text-[#6F7782]">
                          {leadId}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>

                {/* Subject */}
                <td className="py-2.5 px-4 max-w-[240px]">
                  <span className="text-[#111418] dark:text-[#F2F3F5] truncate font-medium group-hover:text-black dark:group-hover:text-white transition-colors block">
                    {job.subject}
                  </span>
                </td>

                {/* Sender */}
                <td className="py-2.5 px-4 hidden md:table-cell text-[#7A8594] dark:text-[#6F7782] font-mono text-[11px] truncate max-w-[160px]">
                  {senderDisplay}
                </td>

                {/* Scheduled Time */}
                <td className="py-2.5 px-4 font-mono text-[11px] whitespace-nowrap">
                  <div className="flex flex-col">
                    <span className="text-[#111418] dark:text-[#F2F3F5]">
                      {scheduledDate.toLocaleString()}
                    </span>
                    <span className="text-[#B45309] dark:text-[#E8B44C] text-[10px] flex items-center gap-1 mt-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#B45309] dark:bg-[#E8B44C] animate-pulse"></span>
                      queued
                    </span>
                  </div>
                </td>

                {/* Engine State Badge */}
                <td className="py-2.5 px-4 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] text-[10px] font-medium bg-[#FEF8EC] dark:bg-[#E8B44C]/10 text-[#B45309] dark:text-[#E8B44C] border border-[#FDE68A] dark:border-[#E8B44C]/25 font-mono">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#B45309] dark:bg-[#E8B44C]"></span>
                    Scheduled
                  </span>
                </td>

                {/* Inspect Action */}
                <td className="py-2.5 px-4 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEmail(job);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#F8F9FB] dark:bg-[#15191E] hover:bg-[#EEF1F5] dark:hover:bg-[#1A1F25] border border-[#D8DEE6] dark:border-[#22272E] text-[#4E5764] dark:text-[#A1A7B0] hover:text-[#111418] dark:hover:text-[#F2F3F5] transition-all cursor-pointer font-medium text-xs"
                  >
                    <Eye size={12} strokeWidth={1.75} />
                    <span>Inspect</span>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
