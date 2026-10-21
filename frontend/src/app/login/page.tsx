"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, API_BASE_URL } from "../../features/auth";
import { useToast } from "../../components/Toast";
import ThemeToggle from "../../components/ThemeToggle";
import {
  AlertCircle,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
} from "lucide-react";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authenticated, loading, refreshUser } = useAuth();
  const toast = useToast();

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [redirecting, setRedirecting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && authenticated) {
      router.replace("/");
    }
  }, [authenticated, loading, router]);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "google_auth_failed") {
      const msg = "Google authentication could not be completed. Please try again.";
      setErrorMessage(msg);
      toast.error(msg, "OAuth Failed");
    } else if (errorParam === "google_not_configured") {
      const msg = "Google OAuth credentials (GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET) are missing from .env.";
      setErrorMessage(msg);
      toast.warning(msg, "OAuth Not Configured");
    } else if (errorParam === "session_save_failed") {
      const msg = "Could not initialize your user session. Please try again.";
      setErrorMessage(msg);
      toast.error(msg, "Session Error");
    }
  }, [searchParams, toast]);

  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      const msg = "Please enter your email address.";
      setErrorMessage(msg);
      toast.warning(msg, "Missing Field");
      return;
    }

    if (!password) {
      const msg = "Please enter your password.";
      setErrorMessage(msg);
      toast.warning(msg, "Missing Field");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: trimmedEmail,
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        const msg =
          data?.error?.message || "Invalid email or password. Please try again.";
        setErrorMessage(msg);
        toast.error(msg, "Authentication Failed");
        setSubmitting(false);
        return;
      }

      toast.success(
        `Welcome back, ${data?.data?.user?.name || "Operator"}!`,
        "Signed In"
      );
      await refreshUser();
      router.replace("/");
    } catch {
      const msg =
        "Unable to connect to authentication service. Please check your backend connection.";
      setErrorMessage(msg);
      toast.error(msg, "Connection Error");
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = () => {
    setRedirecting(true);
    window.location.href = `${API_BASE_URL}/api/auth/google`;
  };

  const fillDemoAccount = () => {
    setEmail("admin@dispatchly.io");
    setPassword("dispatchly123");
    setErrorMessage(null);
    toast.info("Demo credentials loaded into form", "Quick Access");
  };

  const handleForgotPassword = () => {
    toast.info(
      "Password reset instructions will be sent to your verified email address.",
      "Reset Password"
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#090A0C] text-[#6F7782] font-sans">
        <div className="flex flex-col items-center gap-3">
          <img
            src="/logo.png"
            alt="Dispatchly"
            className="h-10 w-auto object-contain animate-pulse"
          />
          <p className="text-xs font-medium font-mono text-[#A1A7B0]">
            Loading Dispatchly...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F4F6F8] dark:bg-[#090A0C] text-[#111418] dark:text-[#F2F3F5] font-sans antialiased select-none transition-colors duration-200">
      {/* Top Application Bar matching Dashboard Header */}
      <header className="fixed top-0 left-0 right-0 h-[54px] bg-white dark:bg-[#0C0E11] border-b border-[#D8DEE6] dark:border-[#22272E] z-40 flex items-center justify-between px-6 font-sans transition-colors duration-200">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt="Dispatchly"
            className="h-6 w-auto object-contain"
          />
          <span className="text-[#6F7782] dark:text-[#6F7782] text-xs font-medium">
            Dispatchly
          </span>
          <span className="text-[#A1A7B0] dark:text-[#3A424E] text-xs">/</span>
          <span className="text-[#111418] dark:text-[#F2F3F5] text-xs font-semibold tracking-tight">
            Sign In
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center px-4 pt-[74px] pb-8">
        {/* Card Component strictly using Dashboard Tokens */}
        <div className="w-full max-w-[420px] rounded-[10px] border border-[#D8DEE6] dark:border-[#22272E] bg-white dark:bg-[#111418] p-7 sm:p-8 shadow-[0_12px_32px_rgba(0,0,0,0.05)] dark:shadow-2xl transition-all">
          {/* Card Header matching Dashboard Typography */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="mb-3 flex items-center justify-center">
              <img
                src="/logo.png"
                alt="Dispatchly Logo"
                className="h-12 w-auto object-contain transition-transform duration-200 hover:scale-105"
              />
            </div>

            <h1 className="text-[22px] font-bold text-[#111418] dark:text-[#F2F3F5] tracking-tight">
              Sign In to Dispatchly
            </h1>
            <p className="text-xs text-[#7A8594] dark:text-[#6F7782] mt-1">
              Schedule outbound emails and monitor delivery activity.
            </p>
          </div>

          {/* Error notification banner if any */}
          {errorMessage && (
            <div className="mb-4 rounded-[8px] border border-[#EF5B68]/30 bg-[#EF5B68]/10 p-2.5 text-xs text-[#EF5B68] flex items-start gap-2">
              <AlertCircle
                size={15}
                strokeWidth={2}
                className="text-[#EF5B68] mt-0.5 shrink-0"
              />
              <div className="flex-1 leading-relaxed text-[11px]">{errorMessage}</div>
            </div>
          )}

          {/* Email & Password Authentication Form */}
          <form onSubmit={handleEmailPasswordLogin} className="space-y-4">
            {/* Email Field */}
            <div>
              <label
                htmlFor="email-input"
                className="block text-[#4E5764] dark:text-[#A1A7B0] font-medium mb-1 text-[11px]"
              >
                Email Address
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3 text-[#7A8594] dark:text-[#6F7782] pointer-events-none">
                  <Mail size={14} strokeWidth={1.8} />
                </div>
                <input
                  id="email-input"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. alex@company.com"
                  className="w-full h-[38px] pl-9 pr-3 rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] bg-white dark:bg-[#0D0F12] text-[#111418] dark:text-[#F2F3F5] placeholder-[#7A8594] dark:placeholder-[#6F7782] text-xs font-sans focus:outline-none focus:border-[#7C3AED] dark:focus:border-white/50 transition-colors"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="password-input"
                  className="block text-[#4E5764] dark:text-[#A1A7B0] font-medium text-[11px]"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-[11px] font-medium text-[#7C3AED] dark:text-[#8B5CF6] hover:underline transition-colors cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative flex items-center">
                <div className="absolute left-3 text-[#7A8594] dark:text-[#6F7782] pointer-events-none">
                  <Lock size={14} strokeWidth={1.8} />
                </div>
                <input
                  id="password-input"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-[38px] pl-9 pr-9 rounded-[8px] border border-[#D8DEE6] dark:border-[#22272E] bg-white dark:bg-[#0D0F12] text-[#111418] dark:text-[#F2F3F5] placeholder-[#7A8594] dark:placeholder-[#6F7782] text-xs font-sans focus:outline-none focus:border-[#7C3AED] dark:focus:border-white/50 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2.5 text-[#7A8594] dark:text-[#6F7782] hover:text-[#111418] dark:hover:text-[#F2F3F5] transition-colors cursor-pointer p-1"
                >
                  {showPassword ? (
                    <EyeOff size={14} strokeWidth={1.8} />
                  ) : (
                    <Eye size={14} strokeWidth={1.8} />
                  )}
                </button>
              </div>
            </div>

            {/* Utility Row: Remember Me & Demo Quick Fill */}
            <div className="flex items-center justify-between pt-0.5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-3.5 w-3.5 rounded-[3px] border-[#D8DEE6] dark:border-[#22272E] text-[#7C3AED] dark:text-[#8B5CF6] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#7C3AED] dark:accent-[#8B5CF6]"
                />
                <span className="text-[11px] text-[#4E5764] dark:text-[#A1A7B0]">
                  Remember this device
                </span>
              </label>

              <button
                type="button"
                onClick={fillDemoAccount}
                className="font-mono text-[10px] px-2 py-0.5 rounded-[4px] bg-[#F4F6F8] dark:bg-[#16191F] border border-[#D8DEE6] dark:border-[#22272E] text-[#4E5764] dark:text-[#A1A7B0] hover:text-[#111418] dark:hover:text-[#F2F3F5] hover:border-black/30 dark:hover:border-white/40 transition-colors cursor-pointer flex items-center gap-1"
                title="Populate test operator credentials"
              >
                <Sparkles size={11} strokeWidth={2} />
                <span>Demo Account</span>
              </button>
            </div>

            {/* Primary Action (White Pill Button Matching Reference Style) */}
            <button
              type="submit"
              disabled={submitting || redirecting}
              className="w-full h-[38px] rounded-full bg-[#111418] dark:bg-white hover:bg-[#1F242C] dark:hover:bg-[#E2E4E9] text-white dark:text-[#090A0C] text-xs font-semibold shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={13} strokeWidth={2.4} />
                </>
              )}
            </button>
          </form>

          {/* Divider matching Dashboard border subtle */}
          <div className="relative flex items-center justify-center my-4">
            <div className="flex-grow h-[1px] bg-[#E6EAF0] dark:bg-[#1A1F25]" />
            <span className="px-3 font-mono text-[10px] uppercase tracking-wider text-[#7A8594] dark:text-[#6F7782] bg-white dark:bg-[#111418]">
              or continue with
            </span>
            <div className="flex-grow h-[1px] bg-[#E6EAF0] dark:bg-[#1A1F25]" />
          </div>

          {/* Google SSO Button (Secondary Pill matching Dashboard) */}
          <div className="w-full">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={redirecting || submitting}
              className="w-full h-[38px] rounded-full border border-[#D8DEE6] dark:border-[#22272E] bg-[#F8F9FB] dark:bg-[#16191F] hover:bg-[#EEF1F5] dark:hover:bg-[#1D222B] text-[#111418] dark:text-[#F2F3F5] text-xs font-semibold flex items-center justify-center gap-2.5 shadow-xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              {/* Google Multi-Color SVG */}
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                <path
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                  fill="#4285F4"
                />
                <path
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                  fill="#34A853"
                />
                <path
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  fill="#EA4335"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            {redirecting && (
              <div className="flex items-center justify-center gap-2 text-[11px] text-[#7A8594] dark:text-[#A1A7B0] pt-2">
                <div className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                <span>Redirecting to Google Identity Services...</span>
              </div>
            )}
          </div>

          {/* Card Footer */}
          <div className="w-full mt-6 pt-3.5 border-t border-[#E6EAF0] dark:border-[#1A1F25] flex items-center justify-between text-[11px] text-[#7A8594] dark:text-[#6F7782]">
            <span>Dispatchly Security</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toast.info("Dispatchly Terms of Service", "Legal")}
                className="hover:text-[#111418] dark:hover:text-[#F2F3F5] transition-colors cursor-pointer"
              >
                Terms
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => toast.info("Dispatchly Privacy Policy", "Privacy")}
                className="hover:text-[#111418] dark:hover:text-[#F2F3F5] transition-colors cursor-pointer"
              >
                Privacy
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Subtle Bottom Status Bar */}
      <footer className="h-10 px-6 flex items-center justify-center text-[11px] text-[#7A8594] dark:text-[#6F7782] font-mono">
        <span>Dispatchly Enterprise Email Infrastructure</span>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#090A0C] text-[#6F7782] text-xs font-mono">
          Loading Dispatchly...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
