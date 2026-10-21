"use client";

import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../auth";
import { useToast } from "../../components/Toast";
import {
  X,
  Mail,
  Key,
  Server,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ExternalLink,
  ShieldCheck,
  Zap,
  Info,
} from "lucide-react";

export interface SenderItem {
  id: string;
  tenantId: string;
  fromAddress: string;
  name?: string;
  type?: "gmail" | "smtp" | "ethereal" | "resend";
  isConfigured?: boolean;
}

interface SenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSenderAdded?: (newSenderId?: string) => void;
}

export default function SenderModal({
  isOpen,
  onClose,
  onSenderAdded,
}: SenderModalProps) {
  const toast = useToast();
  const [activeProvider, setActiveProvider] = useState<"resend" | "gmail" | "smtp">("resend");

  // Form fields
  const [fromAddress, setFromAddress] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pass, setPass] = useState(""); // Resend API Key or Gmail App Password or SMTP pass
  const [host, setHost] = useState("");
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);

  // Existing senders
  const [sendersList, setSendersList] = useState<SenderItem[]>([]);
  const [loadingSenders, setLoadingSenders] = useState(false);

  // Actions state
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);

  const fetchSenders = async () => {
    setLoadingSenders(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/emails/senders`, {
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.data)) {
          setSendersList(json.data);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingSenders(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSenders();
      setTestStatus(null);
    }
  }, [isOpen]);

  // Handle provider switch defaults
  const handleSelectProvider = (provider: "resend" | "gmail" | "smtp") => {
    setActiveProvider(provider);
    setTestStatus(null);
    if (provider === "resend") {
      if (!fromAddress || fromAddress.endsWith("@gmail.com")) {
        setFromAddress("onboarding@resend.dev");
      }
    } else if (provider === "gmail") {
      if (fromAddress === "onboarding@resend.dev") {
        setFromAddress("");
      }
    } else if (provider === "smtp") {
      setHost("smtp.mailgun.org");
      setPort(587);
    }
  };

  const handleTestConnection = async () => {
    if (!pass.trim()) {
      toast.error("Please enter an API Key or Password to test.", "Missing Key");
      return;
    }
    if (!fromAddress.trim()) {
      toast.error("Please enter a sender email address.", "Missing Email");
      return;
    }

    setTesting(true);
    setTestStatus(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/emails/senders/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fromAddress: fromAddress.trim(),
          name: displayName.trim() || undefined,
          type: activeProvider,
          pass: pass.trim(),
          host: activeProvider === "smtp" ? host.trim() : undefined,
          port: activeProvider === "smtp" ? Number(port) : undefined,
          secure: activeProvider === "smtp" ? secure : undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        const msg = json?.error?.message || "Verification failed.";
        setTestStatus({ success: false, message: msg });
        toast.error(msg, "Verification Failed");
      } else {
        setTestStatus({
          success: true,
          message: "Credentials verified successfully! Ready to connect.",
        });
        toast.success("Credentials verified successfully!", "Connection Verified");
      }
    } catch (err: any) {
      const msg = err?.message || "Failed to contact verification service.";
      setTestStatus({ success: false, message: msg });
      toast.error(msg, "Error");
    } finally {
      setTesting(false);
    }
  };

  const handleSaveSender = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pass.trim() || !fromAddress.trim()) {
      toast.error("Please enter all required fields.", "Incomplete Form");
      return;
    }

    setSaving(true);
    setTestStatus(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/emails/senders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fromAddress: fromAddress.trim(),
          name: displayName.trim() || undefined,
          type: activeProvider,
          pass: pass.trim(),
          host: activeProvider === "smtp" ? host.trim() : undefined,
          port: activeProvider === "smtp" ? Number(port) : undefined,
          secure: activeProvider === "smtp" ? secure : undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        const msg = json?.error?.message || "Failed to add sender.";
        setTestStatus({ success: false, message: msg });
        toast.error(msg, "Save Failed");
        return;
      }

      toast.success(
        `Added sender ${fromAddress} (${activeProvider.toUpperCase()})!`,
        "Sender Connected"
      );

      // Reset form
      setPass("");
      setFromAddress("");
      setDisplayName("");
      setTestStatus(null);

      await fetchSenders();
      if (onSenderAdded) {
        onSenderAdded(json.data?.id);
      }
    } catch (err: any) {
      toast.error(err?.message || "Unexpected error saving sender.", "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSender = async (id: string, email: string) => {
    if (!confirm(`Are you sure you want to delete sender ${email}?`)) return;

    setDeletingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/emails/senders/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success(`Removed sender ${email}`, "Sender Deleted");
        await fetchSenders();
        if (onSenderAdded) onSenderAdded();
      } else {
        toast.error("Could not delete sender.", "Delete Error");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete sender", "Error");
    } finally {
      setDeletingId(null);
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
              <ShieldCheck size={16} strokeWidth={1.8} className="text-[#35C98A]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#111418] dark:text-[#F2F3F5] tracking-tight">
                Connect Real Email Sender
              </h2>
              <p className="text-[11px] text-[#7A8594] dark:text-[#6F7782]">
                Configure real outbound channels: Resend API, Gmail App Password, or Custom SMTP.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-[6px] p-1.5 text-[#7A8594] dark:text-[#6F7782] hover:bg-[#F0F3F7] dark:hover:bg-[#15191E] hover:text-[#111418] dark:hover:text-[#F2F3F5] transition-colors cursor-pointer"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        {/* Provider Tabs */}
        <div className="grid grid-cols-3 gap-2 p-1 bg-[#F0F3F7] dark:bg-[#0A0C0E] rounded-[8px] mb-5 border border-[#E6EAF0] dark:border-[#1A1F25]">
          <button
            type="button"
            onClick={() => handleSelectProvider("resend")}
            className={`flex items-center justify-center gap-2 py-2 rounded-[6px] text-xs font-semibold transition-all cursor-pointer ${
              activeProvider === "resend"
                ? "bg-white dark:bg-[#16191F] text-[#111418] dark:text-white shadow-xs"
                : "text-[#7A8594] dark:text-[#8D96A5] hover:text-[#111418] dark:hover:text-white"
            }`}
          >
            <Zap size={14} className={activeProvider === "resend" ? "text-[#7C3AED]" : ""} />
            <span>Resend API</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectProvider("gmail")}
            className={`flex items-center justify-center gap-2 py-2 rounded-[6px] text-xs font-semibold transition-all cursor-pointer ${
              activeProvider === "gmail"
                ? "bg-white dark:bg-[#16191F] text-[#111418] dark:text-white shadow-xs"
                : "text-[#7A8594] dark:text-[#8D96A5] hover:text-[#111418] dark:hover:text-white"
            }`}
          >
            <Mail size={14} className={activeProvider === "gmail" ? "text-rose-500" : ""} />
            <span>Gmail (App Password)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectProvider("smtp")}
            className={`flex items-center justify-center gap-2 py-2 rounded-[6px] text-xs font-semibold transition-all cursor-pointer ${
              activeProvider === "smtp"
                ? "bg-white dark:bg-[#16191F] text-[#111418] dark:text-white shadow-xs"
                : "text-[#7A8594] dark:text-[#8D96A5] hover:text-[#111418] dark:hover:text-white"
            }`}
          >
            <Server size={14} className={activeProvider === "smtp" ? "text-blue-500" : ""} />
            <span>Custom SMTP</span>
          </button>
        </div>

        {/* Helper Banner for Selected Provider */}
        {activeProvider === "resend" && (
          <div className="mb-4 rounded-[8px] border border-purple-500/20 bg-purple-500/5 p-3 text-[11.5px] text-[#4E5764] dark:text-[#CBD5E1] flex items-start gap-2.5">
            <Info size={15} className="text-[#7C3AED] shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-[#111418] dark:text-white">Resend setup: </span>
              Get your API key at{" "}
              <a
                href="https://resend.com/api-keys"
                target="_blank"
                rel="noreferrer"
                className="text-[#7C3AED] dark:text-[#A78BFA] underline font-medium inline-flex items-center gap-0.5"
              >
                resend.com/api-keys <ExternalLink size={10} />
              </a>
              . For testing without a verified custom domain, use{" "}
              <code className="font-mono bg-purple-500/10 px-1 py-0.5 rounded text-purple-700 dark:text-purple-300">
                onboarding@resend.dev
              </code>{" "}
              as From Email.
            </div>
          </div>
        )}

        {activeProvider === "gmail" && (
          <div className="mb-4 rounded-[8px] border border-amber-500/20 bg-amber-500/5 p-3 text-[11.5px] text-[#4E5764] dark:text-[#CBD5E1] flex items-start gap-2.5">
            <Info size={15} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-[#111418] dark:text-white">Gmail App Password setup: </span>
              1. Enable 2-Step Verification on your Google Account. 2. Generate a 16-character App Password at{" "}
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noreferrer"
                className="text-amber-600 dark:text-amber-400 underline font-medium inline-flex items-center gap-0.5"
              >
                myaccount.google.com/apppasswords <ExternalLink size={10} />
              </a>
              . Paste the 16 characters below.
            </div>
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleSaveSender} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[#4E5764] dark:text-[#A1A7B0] font-medium text-[11px] mb-1">
                From Email Address *
              </label>
              <input
                type="email"
                required
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
                placeholder={
                  activeProvider === "resend"
                    ? "onboarding@resend.dev or hello@yourdomain.com"
                    : activeProvider === "gmail"
                    ? "yourname@gmail.com"
                    : "dispatcher@yourdomain.com"
                }
                className="w-full rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] bg-[#F8F9FB] dark:bg-[#0D0F12] px-3 py-2 text-[#111418] dark:text-[#F2F3F5] focus:border-[#7C3AED] dark:focus:border-white/50 focus:outline-none transition-colors"
              />
              {activeProvider === "resend" && fromAddress.trim().toLowerCase().endsWith("@gmail.com") && (
                <div className="mt-1.5 p-2 rounded-[6px] bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-400 space-y-1">
                  <p>
                    ⚠️ Resend does not allow sending directly from personal <strong>@gmail.com</strong> addresses.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[10.5px]">
                    <button
                      type="button"
                      onClick={() => setFromAddress("onboarding@resend.dev")}
                      className="underline font-semibold hover:text-amber-900 dark:hover:text-amber-200 cursor-pointer"
                    >
                      Use onboarding@resend.dev
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => handleSelectProvider("gmail")}
                      className="underline font-semibold hover:text-amber-900 dark:hover:text-amber-200 cursor-pointer"
                    >
                      Switch to Gmail provider
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[#4E5764] dark:text-[#A1A7B0] font-medium text-[11px] mb-1">
                Display Name (Optional)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alex at Dispatchly"
                className="w-full rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] bg-[#F8F9FB] dark:bg-[#0D0F12] px-3 py-2 text-[#111418] dark:text-[#F2F3F5] focus:border-[#7C3AED] dark:focus:border-white/50 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[#4E5764] dark:text-[#A1A7B0] font-medium text-[11px] mb-1">
              {activeProvider === "resend"
                ? "Resend API Key *"
                : activeProvider === "gmail"
                ? "16-Character Google App Password *"
                : "SMTP Password *"}
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder={
                  activeProvider === "resend"
                    ? "re_123456789abcdef..."
                    : activeProvider === "gmail"
                    ? "abcd efgh ijkl mnop"
                    : "••••••••••••••••"
                }
                className="w-full rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] bg-[#F8F9FB] dark:bg-[#0D0F12] px-3 py-2 text-[#111418] dark:text-[#F2F3F5] focus:border-[#7C3AED] dark:focus:border-white/50 focus:outline-none transition-colors font-mono"
              />
            </div>
          </div>

          {activeProvider === "smtp" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="block text-[#4E5764] dark:text-[#A1A7B0] font-medium text-[11px] mb-1">
                  SMTP Host *
                </label>
                <input
                  type="text"
                  required
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="smtp.example.com"
                  className="w-full rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] bg-[#F8F9FB] dark:bg-[#0D0F12] px-3 py-2 text-[#111418] dark:text-[#F2F3F5] focus:border-[#7C3AED] dark:focus:border-white/50 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-[#4E5764] dark:text-[#A1A7B0] font-medium text-[11px] mb-1">
                  Port
                </label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  className="w-full rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] bg-[#F8F9FB] dark:bg-[#0D0F12] px-3 py-2 text-[#111418] dark:text-[#F2F3F5] focus:border-[#7C3AED] dark:focus:border-white/50 focus:outline-none transition-colors"
                />
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="smtp-secure"
                  checked={secure}
                  onChange={(e) => setSecure(e.target.checked)}
                  className="h-4 w-4 rounded border-[#D8DEE6] dark:border-[#22272E] text-[#7C3AED] focus:ring-[#7C3AED]"
                />
                <label htmlFor="smtp-secure" className="text-[11px] text-[#4E5764] dark:text-[#A1A7B0] font-medium cursor-pointer">
                  Use SSL (Port 465)
                </label>
              </div>
            </div>
          )}

          {/* Verification feedback box */}
          {testStatus && (
            <div
              className={`rounded-[8px] p-2.5 text-xs flex items-center gap-2 border ${
                testStatus.success
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
              }`}
            >
              {testStatus.success ? (
                <CheckCircle2 size={16} className="shrink-0" />
              ) : (
                <AlertCircle size={16} className="shrink-0" />
              )}
              <span>{testStatus.message}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || !pass.trim()}
              className="px-3 py-2 rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] bg-[#F8F9FB] dark:bg-[#16191F] text-[#4E5764] dark:text-[#A1A7B0] hover:text-[#111418] dark:hover:text-white font-medium text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {testing ? (
                <>
                  <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Testing Connection...
                </>
              ) : (
                <>
                  <Key size={13} />
                  Test Connection
                </>
              )}
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-[8px] bg-[#111418] dark:bg-white text-white dark:text-[#111418] hover:bg-black dark:hover:bg-[#EAEFF5] font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 size={13} />
                  Save &amp; Connect Sender
                </>
              )}
            </button>
          </div>
        </form>

        {/* Existing Connected Senders Section */}
        <div className="mt-6 pt-5 border-t border-[#E6EAF0] dark:border-[#1A1F25]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#7A8594] dark:text-[#6F7782] mb-3">
            Connected Senders ({sendersList.length})
          </h3>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {sendersList.map((s) => {
              const isReal = s.isConfigured && s.id !== "seed-sender-01";
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-2.5 rounded-[8px] bg-[#F8F9FB] dark:bg-[#0D0F12] border border-[#D8DEE6] dark:border-[#22272E] text-xs"
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        isReal ? "bg-[#35C98A]" : "bg-amber-400"
                      }`}
                    />
                    <div className="truncate">
                      <div className="font-semibold text-[#111418] dark:text-[#F2F3F5] truncate flex items-center gap-1.5">
                        {s.fromAddress}
                        {s.name && (
                          <span className="text-[#7A8594] dark:text-[#6F7782] font-normal">
                            ({s.name})
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#7A8594] dark:text-[#6F7782] uppercase tracking-wide">
                        {s.type || "SMTP"} • {isReal ? "Live Delivery" : "Simulator Sandbox"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-[9.5px] px-2 py-0.5 rounded font-medium ${
                        isReal
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      }`}
                    >
                      {isReal ? "REAL SEND" : "TEST"}
                    </span>

                    {s.id !== "seed-sender-01" && s.id !== "env-resend-sender" && (
                      <button
                        type="button"
                        onClick={() => handleDeleteSender(s.id, s.fromAddress)}
                        disabled={deletingId === s.id}
                        className="text-[#7A8594] hover:text-rose-500 p-1 rounded transition-colors cursor-pointer"
                        title="Delete sender"
                      >
                        {deletingId === s.id ? (
                          <div className="h-3 w-3 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
