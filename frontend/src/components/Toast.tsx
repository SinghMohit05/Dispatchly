"use client";

import React, { createContext, useContext, useState, useCallback, useId } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  addToast: (type: ToastType, message: string, title?: string, duration?: number) => void;
  removeToast: (id: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string, title?: string, duration: number = 4500) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newToast: ToastItem = { id, type, title, message, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback(
    (message: string, title?: string) => addToast("success", message, title),
    [addToast]
  );

  const error = useCallback(
    (message: string, title?: string) => addToast("error", message, title),
    [addToast]
  );

  const warning = useCallback(
    (message: string, title?: string) => addToast("warning", message, title),
    [addToast]
  );

  const info = useCallback(
    (message: string, title?: string) => addToast("info", message, title),
    [addToast]
  );

  return (
    <ToastContext.Provider
      value={{ toasts, addToast, removeToast, success, error, warning, info }}
    >
      {children}
      {/* Fixed Toast Container */}
      <div
        aria-live="polite"
        className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none font-sans"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-200 animate-in slide-in-from-bottom-3 ${
              toast.type === "success"
                ? "bg-white/95 dark:bg-[#141417]/95 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                : toast.type === "error"
                ? "bg-white/95 dark:bg-[#141417]/95 border-rose-500/30 text-rose-800 dark:text-rose-300"
                : toast.type === "warning"
                ? "bg-white/95 dark:bg-[#141417]/95 border-amber-500/30 text-amber-800 dark:text-amber-300"
                : "bg-white/95 dark:bg-[#141417]/95 border-[#6D3DF5]/30 text-[#6D3DF5] dark:text-[#d2bbff]"
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === "success" && (
                <CheckCircle2 size={16} strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" />
              )}
              {toast.type === "error" && (
                <AlertCircle size={16} strokeWidth={2} className="text-rose-600 dark:text-rose-400" />
              )}
              {toast.type === "warning" && (
                <AlertCircle size={16} strokeWidth={2} className="text-amber-600 dark:text-amber-400" />
              )}
              {toast.type === "info" && (
                <Info size={16} strokeWidth={2} className="text-[#6D3DF5] dark:text-[#adc6ff]" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              {toast.title && (
                <h4 className="text-xs font-semibold text-[#171A24] dark:text-white tracking-tight mb-0.5">
                  {toast.title}
                </h4>
              )}
              <p className="text-xs text-[#596173] dark:text-[#e4e1e6] leading-relaxed break-words">
                {toast.message}
              </p>
            </div>

            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="shrink-0 p-1 text-[#8A93A5] hover:text-[#171A24] dark:text-[#958da1] dark:hover:text-white rounded-md transition-colors cursor-pointer"
              title="Dismiss notification"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
