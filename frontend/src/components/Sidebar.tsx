"use client";

import React, { useState } from "react";
import { useAuth } from "../features/auth";
import {
  CalendarClock,
  Send,
  Activity,
  LogOut,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";

interface SidebarProps {
  activeTab: "dashboard" | "scheduled" | "sent";
  onTabChange: (tab: "dashboard" | "scheduled" | "sent") => void;
  scheduledCount: number;
  sentCount: number;
  onOpenSenders?: () => void;
}

export default function Sidebar({
  activeTab,
  onTabChange,
  scheduledCount,
  sentCount,
  onOpenSenders,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const [imgError, setImgError] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      const parts = name.trim().split(" ");
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return name.slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return "MS";
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-[230px] bg-[#F8F9FB] dark:bg-[#0D0F12] border-r border-[#D8DEE6] dark:border-[#22272E] z-50 flex flex-col justify-between select-none font-sans transition-colors duration-200">
      <div className="flex flex-col">
        {/* Brand Header */}
        <div
          onClick={() => onTabChange("dashboard")}
          className="h-[54px] px-4 flex items-center gap-2.5 border-b border-[#E6EAF0] dark:border-[#1A1F25] cursor-pointer group"
          title="Go to Email Scheduler Dashboard"
        >
          {/* Dispatchly Brand Logo */}
          <img
            src="/logo.png"
            alt="Dispatchly"
            className="h-7 w-auto object-contain transition-transform duration-200 group-hover:scale-105"
          />
          <span className="font-bold text-[15px] tracking-tight text-[#111418] dark:text-[#F2F3F5] group-hover:text-black dark:group-hover:text-white transition-colors">
            Dispatchly
          </span>
        </div>

        {/* Navigation Group 1: OPERATIONS */}
        <div className="px-4 pt-5 pb-2">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#7A8594] dark:text-[#6F7782] block">
            Operations
          </span>
        </div>

        <nav className="flex flex-col gap-0.5 px-2.5">
          {/* Scheduled Emails Tab */}
          <button
            type="button"
            onClick={() => onTabChange(activeTab === "scheduled" ? "dashboard" : "scheduled")}
            className={`flex items-center justify-between h-[36px] px-3 rounded-[8px] text-[13px] font-medium transition-colors cursor-pointer ${
              activeTab === "scheduled"
                ? "bg-[#EAEFF5] dark:bg-[#16191F] text-[#111418] dark:text-[#F2F3F5] border border-[#D8DEE6] dark:border-[#22272E]"
                : "text-[#4E5764] dark:text-[#A1A7B0] hover:bg-[#EEF1F5] dark:hover:bg-[#12151A] hover:text-[#111418] dark:hover:text-[#F2F3F5] border border-transparent"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <CalendarClock
                size={15}
                strokeWidth={1.8}
                className={activeTab === "scheduled" ? "text-[#111418] dark:text-white" : "text-[#7A8594] dark:text-[#6F7782]"}
              />
              <span>Scheduled Emails</span>
            </div>
            <span
              className={`font-mono text-[10.5px] px-1.5 py-0.2 rounded font-medium ${
                activeTab === "scheduled"
                  ? "bg-white dark:bg-[#21262E] text-[#111418] dark:text-[#F2F3F5]"
                  : "bg-[#E2E7EE] dark:bg-[#14171C] text-[#7A8594] dark:text-[#6F7782]"
              }`}
            >
              {scheduledCount}
            </span>
          </button>

          {/* Sent Emails Tab */}
          <button
            type="button"
            onClick={() => onTabChange(activeTab === "sent" ? "dashboard" : "sent")}
            className={`flex items-center justify-between h-[36px] px-3 rounded-[8px] text-[13px] font-medium transition-colors cursor-pointer ${
              activeTab === "sent"
                ? "bg-[#EAEFF5] dark:bg-[#16191F] text-[#111418] dark:text-[#F2F3F5] border border-[#D8DEE6] dark:border-[#22272E]"
                : "text-[#4E5764] dark:text-[#A1A7B0] hover:bg-[#EEF1F5] dark:hover:bg-[#12151A] hover:text-[#111418] dark:hover:text-[#F2F3F5] border border-transparent"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Send
                size={15}
                strokeWidth={1.8}
                className={activeTab === "sent" ? "text-[#111418] dark:text-white" : "text-[#7A8594] dark:text-[#6F7782]"}
              />
              <span>Sent Emails</span>
            </div>
            <span
              className={`font-mono text-[10.5px] px-1.5 py-0.2 rounded font-medium ${
                activeTab === "sent"
                  ? "bg-white dark:bg-[#21262E] text-[#111418] dark:text-[#F2F3F5]"
                  : "bg-[#E2E7EE] dark:bg-[#14171C] text-[#7A8594] dark:text-[#6F7782]"
              }`}
            >
              {sentCount}
            </span>
          </button>

          {/* Sender Accounts / Channels */}
          {onOpenSenders && (
            <button
              type="button"
              onClick={onOpenSenders}
              className="flex items-center justify-between h-[36px] px-3 rounded-[8px] text-[13px] font-medium text-[#4E5764] dark:text-[#A1A7B0] hover:bg-[#EEF1F5] dark:hover:bg-[#12151A] hover:text-[#111418] dark:hover:text-[#F2F3F5] transition-colors cursor-pointer border border-transparent group"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck
                  size={15}
                  strokeWidth={1.8}
                  className="text-[#7A8594] dark:text-[#6F7782] group-hover:text-[#35C98A] transition-colors"
                />
                <span>Sender Accounts</span>
              </div>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-[#EAEFF5] dark:bg-[#16191F] text-[#7A8594] dark:text-[#6F7782] font-semibold group-hover:text-[#35C98A] transition-colors">
                Setup
              </span>
            </button>
          )}
        </nav>

        {/* Navigation Group 2: INFRASTRUCTURE */}
        <div className="px-4 pt-5 pb-2">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#7A8594] dark:text-[#6F7782] block">
            Infrastructure
          </span>
        </div>

        <nav className="flex flex-col gap-0.5 px-2.5">
          {/* Queue Monitor link to Bull Board */}
          <a
            href="http://localhost:4000/admin/queues"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between h-[36px] px-3 rounded-[8px] text-[13px] font-medium text-[#4E5764] dark:text-[#A1A7B0] hover:bg-[#EEF1F5] dark:hover:bg-[#12151A] hover:text-[#111418] dark:hover:text-[#F2F3F5] transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-2.5">
              <Activity
                size={15}
                strokeWidth={1.8}
                className="text-[#7A8594] dark:text-[#6F7782] group-hover:text-[#35C98A] transition-colors"
              />
              <span>Queue Monitor</span>
            </div>
            <ExternalLink size={12} className="text-[#7A8594] dark:text-[#6F7782] opacity-60 group-hover:opacity-100" />
          </a>
        </nav>
      </div>

      {/* User Profile — Bottom Left (Exact Reference Style) */}
      <div className="p-3 border-t border-[#E6EAF0] dark:border-[#1A1F25] bg-[#F0F3F7] dark:bg-[#0A0C0E] flex items-center justify-between transition-colors">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="relative shrink-0">
            {user?.avatarUrl && !imgError ? (
              <img
                src={user.avatarUrl}
                alt={user.name || "User Avatar"}
                onError={() => setImgError(true)}
                className="w-8 h-8 rounded-full object-cover border border-[#D8DEE6] dark:border-[#22272E]"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#E2E7EE] dark:bg-[#1C2028] border border-[#CCD3DE] dark:border-[#2E3540] flex items-center justify-center font-mono text-[11px] font-semibold text-[#111418] dark:text-[#F2F3F5]">
                {getInitials(user?.name, user?.email)}
              </div>
            )}
            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-[#35C98A] ring-2 ring-[#F0F3F7] dark:ring-[#0A0C0E]"></span>
          </div>

          <div className="flex flex-col truncate">
            <span className="text-[12.5px] font-semibold text-[#111418] dark:text-[#F2F3F5] truncate leading-tight">
              {user?.name || "Mohit Singh"}
            </span>
            <span className="text-[11px] text-[#7A8594] dark:text-[#6F7782] truncate font-mono mt-0.5">
              {user?.email || "mohitpr5730@gmail.com"}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          title="Sign out"
          className="text-[#7A8594] dark:text-[#6F7782] hover:text-[#EF5B68] hover:bg-[#E2E7EE] dark:hover:bg-[#14171D] p-1.5 rounded-[6px] transition-colors cursor-pointer shrink-0 ml-1 flex items-center justify-center"
        >
          {loggingOut ? (
            <div className="h-3.5 w-3.5 border-2 border-[#111418] dark:border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <LogOut size={14} strokeWidth={1.8} />
          )}
        </button>
      </div>
    </aside>
  );
}
