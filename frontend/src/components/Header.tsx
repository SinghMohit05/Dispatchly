"use client";

import React from "react";
import ThemeToggle from "./ThemeToggle";

interface HeaderProps {
  activeViewTitle?: string;
}

export default function Header({
  activeViewTitle = "Email Scheduler",
}: HeaderProps) {
  return (
    <header className="fixed top-0 left-[230px] right-0 h-[54px] bg-white dark:bg-[#0C0E11] border-b border-[#D8DEE6] dark:border-[#22272E] z-40 flex items-center justify-between px-6 font-sans select-none transition-colors duration-200">
      {/* Left: Minimal Breadcrumb */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[#7A8594] dark:text-[#6F7782] font-medium">Dispatchly</span>
        <span className="text-[#A1A7B0] dark:text-[#3A424E]">/</span>
        <span className="text-[#111418] dark:text-[#F2F3F5] font-semibold tracking-tight">{activeViewTitle}</span>
      </div>

      {/* Right: Functional Controls Only */}
      <div className="flex items-center gap-3">
        {/* Theme Toggle Button */}
        <ThemeToggle />
      </div>
    </header>
  );
}

