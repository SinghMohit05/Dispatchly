"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "./ThemeProvider";
import { Sun, Moon } from "lucide-react";

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export default function ThemeToggle({
  className = "",
  showLabel = false,
}: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={`h-8 w-8 rounded-lg border border-[#D8DEE6] dark:border-[#22272E] bg-[#F8F9FB] dark:bg-[#111418] opacity-60 ${className}`}
        aria-hidden="true"
      />
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`relative flex items-center justify-center gap-2 rounded-lg border border-[#D8DEE6] hover:border-[#CCD3DE] bg-[#F8F9FB] hover:bg-[#EEF1F5] dark:border-[#22272E] dark:hover:border-[#353C47] dark:bg-[#111418] dark:hover:bg-[#15191E] text-[#111418] dark:text-[#F2F3F5] transition-all cursor-pointer select-none group shadow-xs ${
        showLabel ? "px-3 py-1.5 text-xs font-medium" : "h-8 w-8"
      } ${className}`}
    >
      <div className="relative flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
        {isDark ? (
          <Sun
            size={15}
            strokeWidth={1.8}
            className="text-amber-400 group-hover:rotate-45 transition-transform duration-300"
          />
        ) : (
          <Moon
            size={15}
            strokeWidth={1.8}
            className="text-[#7C3AED] group-hover:-rotate-12 transition-transform duration-300"
          />
        )}
      </div>

      {showLabel && (
        <span className="font-sans text-xs text-[#4E5764] dark:text-[#A1A7B0]">
          {isDark ? "Light Mode" : "Dark Mode"}
        </span>
      )}
    </button>
  );
}
