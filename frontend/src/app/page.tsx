"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { useAuth, API_BASE_URL } from "../features/auth";
import { ComposeModal } from "../features/compose";
import { ScheduledTable } from "../features/scheduled";
import { SentTable } from "../features/sent";
import EmailDetailModal, { EmailJobDetail } from "../components/EmailDetailModal";
import { useToast } from "../components/Toast";
import {
  CalendarClock,
  Send,
  CheckCircle2,
  AlertCircle,
  Activity,
  Plus,
  RefreshCw,
  Search,
  X,
  Clock,
  ExternalLink,
  ArrowRight,
  ChevronLeft,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { SenderModal } from "../features/senders";

const POLLING_INTERVAL_MS = 4000;

interface ActivityEvent {
  id: string;
  type: "sent" | "failed" | "scheduled";
  title: string;
  recipient: string;
  subject: string;
  time: string;
  error?: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const { authenticated, loading: authLoading } = useAuth();
  const toast = useToast();

  // Navigation state: 'dashboard' is the 2x2 overview, 'scheduled' and 'sent' are full table views
  const [activeTab, setActiveTab] = useState<"dashboard" | "scheduled" | "sent">("dashboard");

  // Email records
  const [scheduledJobs, setScheduledJobs] = useState<EmailJobDetail[]>([]);
  const [sentJobs, setSentJobs] = useState<EmailJobDetail[]>([]);
  const [allEmails, setAllEmails] = useState<EmailJobDetail[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Search state (scoped inside email management)
  const [searchInput, setSearchInput] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Real KPI counters
  const [scheduledCount, setScheduledCount] = useState<number>(0);
  const [sentCount, setSentCount] = useState<number>(0);
  const [failedCount, setFailedCount] = useState<number>(0);

  // Modals state
  const [showComposeModal, setShowComposeModal] = useState<boolean>(false);
  const [showSenderModal, setShowSenderModal] = useState<boolean>(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailJobDetail | null>(null);

  // Debounce search query by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Keyboard shortcut listener ('c' for compose)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key.toLowerCase() === "c" && !showComposeModal && !selectedEmail) {
        e.preventDefault();
        setShowComposeModal(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showComposeModal, selectedEmail]);


  // Redirect to login if unauthenticated
  useEffect(() => {
    if (!authLoading && !authenticated) {
      router.replace("/login");
    }
  }, [authLoading, authenticated, router]);

  // Fetch real count indicators & data
  const fetchData = useCallback(
    async (silent: boolean = false) => {
      if (!silent) setLoadingData(true);

      try {
        const isSearching = debouncedSearch.length > 0;
        let schedUrl = `${API_BASE_URL}/api/emails?status=SCHEDULED`;
        let sentUrl = `${API_BASE_URL}/api/emails?status=SENT`;
        let failUrl = `${API_BASE_URL}/api/emails?status=FAILED`;

        if (isSearching) {
          schedUrl = `${API_BASE_URL}/api/emails/search?q=${encodeURIComponent(debouncedSearch)}`;
        }

        const [schedRes, sentRes, failRes] = await Promise.all([
          fetch(schedUrl, { credentials: "include" }),
          fetch(sentUrl, { credentials: "include" }),
          fetch(failUrl, { credentials: "include" }),
        ]);

        let schedList: EmailJobDetail[] = [];
        let sentList: EmailJobDetail[] = [];
        let failList: EmailJobDetail[] = [];

        if (schedRes.ok) {
          const sJson = await schedRes.json();
          const items = Array.isArray(sJson.data) ? sJson.data : [];
          schedList = isSearching ? items.filter((j: EmailJobDetail) => j.status === "SCHEDULED") : items;
          if (!isSearching) setScheduledCount(items.length);
        }

        if (sentRes.ok) {
          const sentJson = await sentRes.json();
          const items = Array.isArray(sentJson.data) ? sentJson.data : [];
          sentList = items;
          if (!isSearching) setSentCount(items.length);
        }

        if (failRes.ok) {
          const failJson = await failRes.json();
          const items = Array.isArray(failJson.data) ? failJson.data : [];
          failList = items;
          if (!isSearching) setFailedCount(items.length);
        }

        // Combine sent and failed for the sent logs
        const combinedSent = [...sentList, ...failList].sort((a, b) => {
          const timeA = new Date(a.sentAt || a.createdAt).getTime();
          const timeB = new Date(b.sentAt || b.createdAt).getTime();
          return timeB - timeA;
        });

        setScheduledJobs(schedList);
        setSentJobs(combinedSent);
        setAllEmails([...schedList, ...combinedSent]);
        setFetchError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to connect to orchestrator";
        setFetchError(msg);
        if (!silent) toast.error(msg, "Network Error");
      } finally {
        setLoadingData(false);
      }
    },
    [debouncedSearch, toast]
  );

  // Initial fetch and on search change
  useEffect(() => {
    if (authenticated) {
      fetchData(false);
    }
  }, [authenticated, fetchData]);

  // Polling
  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchData(true);
      }
    }, POLLING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [authenticated, fetchData]);

  // Manual refresh
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchData(false);
      toast.success("Synchronized queue records with orchestrator", "Refreshed");
    } catch {
      toast.error("Failed to sync records", "Error");
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  // Clear all scheduled and past emails
  const [clearing, setClearing] = useState(false);
  const handleClearAllEmails = async () => {
    if (
      !confirm(
        "Are you sure you want to remove ALL scheduled, sent, and failed emails? This will purge the queue and reset history."
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/emails`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("All scheduled and past emails have been purged.", "Queue Cleared");
        await fetchData(false);
      } else {
        toast.error("Failed to clear email queue", "Error");
      }
    } catch {
      toast.error("Failed to reach server to clear emails", "Error");
    } finally {
      setClearing(false);
    }
  };

  // Synthesize REAL activity events from database records
  const recentActivities = useMemo<ActivityEvent[]>(() => {
    const events: ActivityEvent[] = [];

    allEmails.forEach((job) => {
      if (job.status === "SENT" && job.sentAt) {
        events.push({
          id: `sent-${job.id}`,
          type: "sent",
          title: `Email sent to ${job.recipient}`,
          recipient: job.recipient,
          subject: job.subject,
          time: job.sentAt,
        });
      } else if (job.status === "FAILED") {
        events.push({
          id: `fail-${job.id}`,
          type: "failed",
          title: `Email delivery failed for ${job.recipient}`,
          recipient: job.recipient,
          subject: job.subject,
          time: job.sentAt || job.createdAt,
          error: job.error,
        });
      } else if (job.status === "SCHEDULED") {
        events.push({
          id: `sched-${job.id}`,
          type: "scheduled",
          title: `Email scheduled for ${job.recipient}`,
          recipient: job.recipient,
          subject: job.subject,
          time: job.createdAt,
        });
      }
    });

    return events
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 5);
  }, [allEmails]);

  // Format short timestamp
  const formatTime = (isoString?: string | null) => {
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return isoString;
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return isoString;
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#090A0C] text-[#6F7782] font-sans">
        <div className="flex flex-col items-center gap-3">
          <img
            src="/logo.png"
            alt="Dispatchly"
            className="h-12 w-auto object-contain animate-pulse"
          />
          <p className="text-xs font-medium font-mono text-[#A1A7B0]">
            Loading Dispatchly...
          </p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  const activeViewTitle =
    activeTab === "dashboard"
      ? "Email Scheduler"
      : activeTab === "scheduled"
      ? "Scheduled Emails"
      : "Sent Emails";

  return (
    <div className="min-h-screen flex bg-[#F4F6F8] dark:bg-[#090A0C] text-[#111418] dark:text-[#F2F3F5] font-sans antialiased select-none transition-colors duration-200">
      {/* 1. Desktop Fixed Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        scheduledCount={scheduledCount}
        sentCount={sentCount}
        onOpenSenders={() => setShowSenderModal(true)}
      />

      {/* 2. Main Application Viewport */}
      <div className="pl-[230px] flex-1 flex flex-col min-w-0">
        <Header activeViewTitle={activeViewTitle} />

        <main className="pt-[68px] px-8 pb-12 max-w-[1340px] w-full mx-auto space-y-6">
          {/* Main Dashboard Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                {activeTab !== "dashboard" && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("dashboard")}
                    className="p-1 -ml-1 text-[#7A8594] dark:text-[#6F7782] hover:text-[#111418] dark:hover:text-[#F2F3F5] rounded-[6px] hover:bg-[#EAEFF5] dark:hover:bg-[#16191F] transition-colors cursor-pointer"
                    title="Back to Dashboard Overview"
                  >
                    <ChevronLeft size={20} />
                  </button>
                )}
                <h1 className="text-[22px] font-bold text-[#111418] dark:text-[#F2F3F5] tracking-tight">
                  {activeViewTitle}
                </h1>
              </div>
              <p className="text-xs text-[#7A8594] dark:text-[#6F7782] mt-0.5">
                Schedule outbound emails and monitor delivery activity.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Refresh Button */}
              <button
                type="button"
                onClick={handleManualRefresh}
                title="Synchronize queue state"
                className="h-[34px] w-[34px] flex items-center justify-center bg-white dark:bg-[#111418] hover:bg-[#F8F9FB] dark:hover:bg-[#15191E] border border-[#D8DEE6] dark:border-[#22272E] text-[#4E5764] dark:text-[#A1A7B0] hover:text-[#111418] dark:hover:text-[#F2F3F5] rounded-[8px] transition-colors cursor-pointer shadow-xs"
              >
                <RefreshCw
                  size={14}
                  strokeWidth={1.8}
                  className={isRefreshing || loadingData ? "animate-spin text-[#111418] dark:text-white" : ""}
                />
              </button>

              {/* Clear All / Purge Queue Button */}
              <button
                type="button"
                onClick={handleClearAllEmails}
                disabled={clearing || (scheduledCount === 0 && sentCount === 0 && failedCount === 0)}
                title="Remove all scheduled and past emails"
                className="h-[34px] px-3 bg-white dark:bg-[#111418] hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-[#D8DEE6] dark:border-[#22272E] hover:border-rose-300 dark:hover:border-rose-800 text-[#7A8594] hover:text-rose-600 dark:hover:text-rose-400 rounded-[8px] transition-colors cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 text-xs font-medium"
              >
                {clearing ? (
                  <div className="h-3.5 w-3.5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 size={13} strokeWidth={1.8} />
                )}
                <span>Clear All</span>
              </button>

              {/* Real Senders Setup Button */}
              <button
                type="button"
                onClick={() => setShowSenderModal(true)}
                className="h-[34px] px-3.5 bg-white dark:bg-[#16191F] hover:bg-[#F0F3F7] dark:hover:bg-[#1D222B] text-[#111418] dark:text-[#F2F3F5] border border-[#D8DEE6] dark:border-[#22272E] rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
              >
                <ShieldCheck size={14} strokeWidth={2} className="text-[#35C98A]" />
                <span>Real Senders</span>
              </button>

              {/* Compose Action (Pill Button Matching Reference) */}
              <button
                type="button"
                onClick={() => setShowComposeModal(true)}
                className="h-[34px] px-4 bg-[#111418] dark:bg-white hover:bg-[#1F242C] dark:hover:bg-[#E2E4E9] text-white dark:text-[#090A0C] rounded-full text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
              >
                <Plus size={15} strokeWidth={2.4} className="text-white dark:text-[#090A0C]" />
                <span>Compose Email</span>
              </button>
            </div>
          </div>

          {/* 3. KPI Section — 4 Rectangular Cards (Matching Reference Style) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Card 1: SCHEDULED */}
            <div className="bg-white dark:bg-[#111418] rounded-[10px] p-4 border border-[#D8DEE6] dark:border-[#22272E] flex flex-col justify-between h-[96px] transition-colors hover:bg-[#F8F9FB] dark:hover:bg-[#15191E] shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#7A8594] dark:text-[#6F7782]">
                  Scheduled
                </span>
                <CalendarClock size={16} strokeWidth={1.8} className="text-[#4E5764] dark:text-[#A1A7B0]" />
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-[#111418] dark:text-[#F2F3F5] tracking-tight">
                  {scheduledCount}
                </div>
                <div className="text-[11px] text-[#7A8594] dark:text-[#6F7782]">Upcoming emails</div>
              </div>
            </div>

            {/* Card 2: SENT */}
            <div className="bg-white dark:bg-[#111418] rounded-[10px] p-4 border border-[#D8DEE6] dark:border-[#22272E] flex flex-col justify-between h-[96px] transition-colors hover:bg-[#F8F9FB] dark:hover:bg-[#15191E] shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#7A8594] dark:text-[#6F7782]">
                  Sent
                </span>
                <CheckCircle2 size={16} strokeWidth={1.8} className="text-[#16A34A] dark:text-[#35C98A]" />
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-[#111418] dark:text-[#F2F3F5] tracking-tight">
                  {sentCount}
                </div>
                <div className="text-[11px] text-[#7A8594] dark:text-[#6F7782]">Successfully processed</div>
              </div>
            </div>

            {/* Card 3: FAILED */}
            <div className="bg-white dark:bg-[#111418] rounded-[10px] p-4 border border-[#D8DEE6] dark:border-[#22272E] flex flex-col justify-between h-[96px] transition-colors hover:bg-[#F8F9FB] dark:hover:bg-[#15191E] shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#7A8594] dark:text-[#6F7782]">
                  Failed
                </span>
                <AlertCircle size={16} strokeWidth={1.8} className="text-[#EF5B68]" />
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-[#111418] dark:text-[#F2F3F5] tracking-tight">
                  {failedCount}
                </div>
                <div className="text-[11px] text-[#7A8594] dark:text-[#6F7782]">Needs attention</div>
              </div>
            </div>

            {/* Card 4: QUEUE */}
            <div className="bg-white dark:bg-[#111418] rounded-[10px] p-4 border border-[#D8DEE6] dark:border-[#22272E] flex flex-col justify-between h-[96px] transition-colors hover:bg-[#F8F9FB] dark:hover:bg-[#15191E] shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#7A8594] dark:text-[#6F7782]">
                  Queue
                </span>
                <Activity size={16} strokeWidth={1.8} className="text-[#16A34A] dark:text-[#35C98A]" />
              </div>
              <div>
                <div className="text-2xl font-bold text-[#111418] dark:text-[#F2F3F5] tracking-tight flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#16A34A] dark:bg-[#35C98A]" />
                  <span>Operational</span>
                </div>
                <div className="text-[11px] text-[#7A8594] dark:text-[#6F7782]">Scheduler status</div>
              </div>
            </div>
          </div>

          {/* Inline Error State Banner if needed */}
          {fetchError && (
            <div className="rounded-[8px] border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-500 dark:text-rose-300 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle size={15} className="text-rose-500 dark:text-rose-400 shrink-0" />
                <span>Unable to sync with orchestrator: {fetchError}</span>
              </div>
              <button
                type="button"
                onClick={() => fetchData(false)}
                className="font-semibold underline hover:text-black dark:hover:text-white cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* 4. MAIN CONTENT PANELS (2x2 Structured Layout when activeTab === 'dashboard') */}
          {activeTab === "dashboard" ? (
            <div className="space-y-4">
              {/* Top Row: Scheduled Emails & Recent Activity */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Panel 1: SCHEDULED EMAILS */}
                <div className="bg-white dark:bg-[#111418] rounded-[10px] border border-[#D8DEE6] dark:border-[#22272E] flex flex-col overflow-hidden shadow-xs">
                  <div className="px-4 py-3 border-b border-[#E6EAF0] dark:border-[#1A1F25] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#111418] dark:text-[#F2F3F5]">Scheduled Emails</span>
                      <span className="font-mono text-[11px] text-[#7A8594] dark:text-[#6F7782]">({scheduledCount})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("scheduled")}
                      className="text-xs text-[#4E5764] dark:text-[#A1A7B0] hover:text-[#111418] dark:hover:text-[#F2F3F5] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <span>View all</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>

                  <div className="divide-y divide-[#E6EAF0] dark:divide-[#1A1F25] flex-1">
                    {scheduledJobs.length === 0 ? (
                      /* Compact Empty State */
                      <div className="p-8 text-center flex flex-col items-center justify-center">
                        <CalendarClock size={24} className="text-[#7A8594] dark:text-[#6F7782] mb-2" strokeWidth={1.5} />
                        <span className="text-xs font-medium text-[#111418] dark:text-[#F2F3F5]">No scheduled emails</span>
                        <p className="text-[11px] text-[#7A8594] dark:text-[#6F7782] mt-0.5 max-w-[220px]">
                          Schedule your first outbound email batch.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowComposeModal(true)}
                          className="mt-3 px-4 py-1.5 bg-[#111418] dark:bg-white hover:bg-[#1F242C] dark:hover:bg-[#E2E4E9] text-white dark:text-[#090A0C] text-xs font-semibold rounded-full transition-colors cursor-pointer shadow-xs active:scale-[0.98]"
                        >
                          + Compose Email
                        </button>
                      </div>
                    ) : (
                      scheduledJobs.slice(0, 4).map((job) => (
                        <div
                          key={job.id}
                          onClick={() => setSelectedEmail(job)}
                          className="px-4 py-3 hover:bg-[#F8F9FB] dark:hover:bg-[#15191E] transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-medium text-[#111418] dark:text-[#F2F3F5] group-hover:text-black dark:group-hover:text-white truncate">
                              {job.recipient}
                            </span>
                            <span className="text-[11px] text-[#7A8594] dark:text-[#6F7782] truncate mt-0.5">
                              {job.subject || "(No subject)"}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 text-right">
                            <div className="flex flex-col font-mono text-[11px] text-[#4E5764] dark:text-[#A1A7B0]">
                              <span>{formatTime(job.scheduledFor)}</span>
                              <span className="text-[10px] text-[#7A8594] dark:text-[#6F7782]">{formatDate(job.scheduledFor)}</span>
                            </div>
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-[#FEF8EC] dark:bg-[#1A1E26] text-[#B45309] dark:text-[#E8B44C] text-[10px] font-medium border border-[#FDE68A] dark:border-[#262D38]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#B45309] dark:bg-[#E8B44C]" />
                              <span>Scheduled</span>
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {scheduledJobs.length > 0 && (
                    <div className="p-2.5 border-t border-[#E6EAF0] dark:border-[#1A1F25] text-center bg-[#F8F9FB] dark:bg-[#0E1014]">
                      <button
                        type="button"
                        onClick={() => setActiveTab("scheduled")}
                        className="text-xs text-[#4E5764] dark:text-[#A1A7B0] hover:text-[#111418] dark:hover:text-[#F2F3F5] transition-colors cursor-pointer font-medium"
                      >
                        View all scheduled emails ({scheduledCount})
                      </button>
                    </div>
                  )}
                </div>

                {/* Panel 2: RECENT ACTIVITY */}
                <div className="bg-white dark:bg-[#111418] rounded-[10px] border border-[#D8DEE6] dark:border-[#22272E] flex flex-col overflow-hidden shadow-xs">
                  <div className="px-4 py-3 border-b border-[#E6EAF0] dark:border-[#1A1F25] flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#111418] dark:text-[#F2F3F5]">Recent Activity</span>
                    <span className="font-mono text-[11px] text-[#7A8594] dark:text-[#6F7782]">Live stream</span>
                  </div>

                  <div className="divide-y divide-[#E6EAF0] dark:divide-[#1A1F25] flex-1">
                    {recentActivities.length === 0 ? (
                      <div className="p-8 text-center flex flex-col items-center justify-center">
                        <Activity size={24} className="text-[#7A8594] dark:text-[#6F7782] mb-2" strokeWidth={1.5} />
                        <span className="text-xs font-medium text-[#111418] dark:text-[#F2F3F5]">No activity recorded yet</span>
                        <p className="text-[11px] text-[#7A8594] dark:text-[#6F7782] mt-0.5">
                          Outbound email events will stream here automatically.
                        </p>
                      </div>
                    ) : (
                      recentActivities.map((act) => (
                        <div key={act.id} className="px-4 py-3 flex items-start gap-3 hover:bg-[#F8F9FB] dark:hover:bg-[#15191E] transition-colors">
                          <div className="mt-0.5 shrink-0">
                            {act.type === "sent" && (
                              <CheckCircle2 size={15} className="text-[#16A34A] dark:text-[#35C98A]" />
                            )}
                            {act.type === "failed" && (
                              <AlertCircle size={15} className="text-[#EF5B68]" />
                            )}
                            {act.type === "scheduled" && (
                              <Clock size={15} className="text-[#4E5764] dark:text-[#A1A7B0]" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium text-[#111418] dark:text-[#F2F3F5] block truncate">
                              {act.title}
                            </span>
                            <span className="text-[11px] text-[#7A8594] dark:text-[#6F7782] block truncate mt-0.5">
                              {act.subject}
                            </span>
                          </div>

                          <span className="font-mono text-[10.5px] text-[#7A8594] dark:text-[#6F7782] shrink-0">
                            {formatTime(act.time)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom Row: Sent Emails & Queue Status */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Panel 3: SENT EMAILS */}
                <div className="bg-white dark:bg-[#111418] rounded-[10px] border border-[#D8DEE6] dark:border-[#22272E] flex flex-col overflow-hidden shadow-xs">
                  <div className="px-4 py-3 border-b border-[#E6EAF0] dark:border-[#1A1F25] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#111418] dark:text-[#F2F3F5]">Sent Emails</span>
                      <span className="font-mono text-[11px] text-[#7A8594] dark:text-[#6F7782]">({sentCount + failedCount})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("sent")}
                      className="text-xs text-[#4E5764] dark:text-[#A1A7B0] hover:text-[#111418] dark:hover:text-[#F2F3F5] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <span>View all</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>

                  <div className="divide-y divide-[#E6EAF0] dark:divide-[#1A1F25] flex-1">
                    {sentJobs.length === 0 ? (
                      <div className="p-8 text-center flex flex-col items-center justify-center">
                        <Send size={24} className="text-[#7A8594] dark:text-[#6F7782] mb-2" strokeWidth={1.5} />
                        <span className="text-xs font-medium text-[#111418] dark:text-[#F2F3F5]">No sent emails yet</span>
                        <p className="text-[11px] text-[#7A8594] dark:text-[#6F7782] mt-0.5">
                          Completed and failed dispatches will appear here.
                        </p>
                      </div>
                    ) : (
                      sentJobs.slice(0, 4).map((job) => (
                        <div
                          key={job.id}
                          onClick={() => setSelectedEmail(job)}
                          className="px-4 py-3 hover:bg-[#F8F9FB] dark:hover:bg-[#15191E] transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-medium text-[#111418] dark:text-[#F2F3F5] group-hover:text-black dark:group-hover:text-white truncate">
                              {job.recipient}
                            </span>
                            <span className="text-[11px] text-[#7A8594] dark:text-[#6F7782] truncate mt-0.5">
                              {job.subject || "(No subject)"}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 text-right">
                            <span className="font-mono text-[11px] text-[#4E5764] dark:text-[#A1A7B0]">
                              {formatTime(job.sentAt || job.createdAt)}
                            </span>
                            {job.status === "SENT" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#F0FDF4] dark:bg-[#12221A] text-[#16A34A] dark:text-[#35C98A] text-[10px] font-medium border border-[#BBF7D0] dark:border-[#1B3828]">
                                <CheckCircle2 size={11} />
                                <span>Sent</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#FEF2F2] dark:bg-[#2A1417] text-[#EF5B68] text-[10px] font-medium border border-[#FECACA] dark:border-[#441E23]">
                                <AlertCircle size={11} />
                                <span>Failed</span>
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {sentJobs.length > 0 && (
                    <div className="p-2.5 border-t border-[#E6EAF0] dark:border-[#1A1F25] text-center bg-[#F8F9FB] dark:bg-[#0E1014]">
                      <button
                        type="button"
                        onClick={() => setActiveTab("sent")}
                        className="text-xs text-[#4E5764] dark:text-[#A1A7B0] hover:text-[#111418] dark:hover:text-[#F2F3F5] transition-colors cursor-pointer font-medium"
                      >
                        View all sent emails ({sentCount + failedCount})
                      </button>
                    </div>
                  )}
                </div>

                {/* Panel 4: QUEUE STATUS */}
                <div className="bg-white dark:bg-[#111418] rounded-[10px] border border-[#D8DEE6] dark:border-[#22272E] flex flex-col justify-between overflow-hidden p-5 shadow-xs">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-[#E6EAF0] dark:border-[#1A1F25]">
                      <span className="text-sm font-semibold text-[#111418] dark:text-[#F2F3F5]">Queue Status</span>
                      <span className="font-mono text-[11px] text-[#7A8594] dark:text-[#6F7782]">BullMQ</span>
                    </div>

                    <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#111418] dark:text-[#F2F3F5]">
                      <span className="h-2 w-2 rounded-full bg-[#16A34A] dark:bg-[#35C98A]" />
                      <span>Operational</span>
                    </div>
                    <p className="text-xs text-[#7A8594] dark:text-[#6F7782] mt-1">
                      BullMQ delayed scheduler is active on Redis.
                    </p>

                    <div className="mt-5 grid grid-cols-3 gap-2 py-3 px-3.5 bg-[#F8F9FB] dark:bg-[#0D0F12] rounded-[8px] border border-[#E6EAF0] dark:border-[#1A1F25] font-mono text-center">
                      <div>
                        <span className="text-[10px] text-[#7A8594] dark:text-[#6F7782] block uppercase">Delayed</span>
                        <span className="text-sm font-bold text-[#111418] dark:text-[#F2F3F5]">{scheduledCount}</span>
                      </div>
                      <div className="border-x border-[#E6EAF0] dark:border-[#1A1F25]">
                        <span className="text-[10px] text-[#7A8594] dark:text-[#6F7782] block uppercase">Processed</span>
                        <span className="text-sm font-bold text-[#16A34A] dark:text-[#35C98A]">{sentCount}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#7A8594] dark:text-[#6F7782] block uppercase">Failed</span>
                        <span className="text-sm font-bold text-[#EF5B68]">{failedCount}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#E6EAF0] dark:border-[#1A1F25] flex items-center justify-between text-xs mt-4">
                    <span className="text-[#7A8594] dark:text-[#6F7782] font-mono text-[11px]">email-dispatch-queue</span>
                    <a
                      href="http://localhost:4000/admin/queues"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#4E5764] dark:text-[#A1A7B0] hover:text-[#111418] dark:hover:text-[#F2F3F5] font-medium flex items-center gap-1 transition-colors"
                    >
                      <span>Open Queue Monitor</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Dedicated Table Management View (Scheduled or Sent) */
            <div className="bg-white dark:bg-[#111418] rounded-[10px] border border-[#D8DEE6] dark:border-[#22272E] overflow-hidden shadow-xs">
              {/* Management Toolbar */}
              <div className="p-3.5 border-b border-[#E6EAF0] dark:border-[#1A1F25] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Segmented Switcher (Subtle segmented control) */}
                <div className="flex items-center gap-1 bg-[#F4F6F8] dark:bg-[#0D0F12] p-1 rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] w-fit">
                  <button
                    type="button"
                    onClick={() => setActiveTab("scheduled")}
                    className={`px-3 py-1.5 rounded-[6px] text-xs font-medium transition-colors cursor-pointer flex items-center gap-2 ${
                      activeTab === "scheduled"
                        ? "bg-white dark:bg-[#1C2028] text-[#111418] dark:text-[#F2F3F5] border border-[#D8DEE6] dark:border-[#2D333F] shadow-xs"
                        : "text-[#7A8594] dark:text-[#6F7782] hover:text-[#111418] dark:hover:text-[#F2F3F5]"
                    }`}
                  >
                    <CalendarClock size={14} className={activeTab === "scheduled" ? "text-[#111418] dark:text-white" : ""} />
                    <span>Scheduled</span>
                    <span className="font-mono text-[10.5px] px-1.5 py-0.2 rounded bg-[#EAEFF5] dark:bg-[#111418] text-[#4E5764] dark:text-[#A1A7B0]">
                      {scheduledCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("sent")}
                    className={`px-3 py-1.5 rounded-[6px] text-xs font-medium transition-colors cursor-pointer flex items-center gap-2 ${
                      activeTab === "sent"
                        ? "bg-white dark:bg-[#1C2028] text-[#111418] dark:text-[#F2F3F5] border border-[#D8DEE6] dark:border-[#2D333F] shadow-xs"
                        : "text-[#7A8594] dark:text-[#6F7782] hover:text-[#111418] dark:hover:text-[#F2F3F5]"
                    }`}
                  >
                    <Send size={14} className={activeTab === "sent" ? "text-[#111418] dark:text-white" : ""} />
                    <span>Sent</span>
                    <span className="font-mono text-[10.5px] px-1.5 py-0.2 rounded bg-[#EAEFF5] dark:bg-[#111418] text-[#4E5764] dark:text-[#A1A7B0]">
                      {sentCount}
                    </span>
                  </button>
                </div>

                {/* Scoped Search Box */}
                <div className="relative w-full sm:w-72">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8594] dark:text-[#6F7782]" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search recipient or subject..."
                    className="w-full h-[34px] pl-8 pr-8 bg-white dark:bg-[#0D0F12] rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] text-xs text-[#111418] dark:text-[#F2F3F5] placeholder-[#7A8594] dark:placeholder-[#6F7782] focus:border-[#7C3AED] dark:focus:border-white/50 focus:outline-none transition-colors"
                  />
                  {searchInput && (
                    <button
                      type="button"
                      onClick={() => setSearchInput("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7A8594] dark:text-[#6F7782] hover:text-[#111418] dark:hover:text-[#F2F3F5] p-1 flex items-center cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Table Data */}
              {activeTab === "scheduled" ? (
                <ScheduledTable
                  emails={scheduledJobs}
                  loading={loadingData}
                  searchQuery={debouncedSearch}
                  onComposeClick={() => setShowComposeModal(true)}
                  onSelectEmail={(email) => setSelectedEmail(email)}
                />
              ) : (
                <SentTable
                  emails={sentJobs}
                  loading={loadingData}
                  searchQuery={debouncedSearch}
                  onSelectEmail={(email) => setSelectedEmail(email)}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {/* Compose Email Modal */}
      <ComposeModal
        isOpen={showComposeModal}
        onClose={() => setShowComposeModal(false)}
        onSuccess={() => fetchData(false)}
      />

      {/* Email Detail Inspection Modal */}
      <EmailDetailModal
        email={selectedEmail}
        isOpen={selectedEmail !== null}
        onClose={() => setSelectedEmail(null)}
      />

      {/* Real Sender Channels Configuration Modal */}
      <SenderModal
        isOpen={showSenderModal}
        onClose={() => setShowSenderModal(false)}
        onSenderAdded={() => fetchData(false)}
      />
    </div>
  );
}
