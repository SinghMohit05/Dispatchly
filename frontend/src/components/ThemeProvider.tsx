"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  toggleTheme: () => {},
  setTheme: () => {},
});

const STORAGE_KEY = "dispatchly_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState<boolean>(false);

  // Synchronize DOM classes and data attribute cleanly
  const applyThemeToDOM = useCallback((newTheme: Theme) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (newTheme === "dark") {
      root.classList.remove("light");
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
      root.classList.add("light");
    }
    root.setAttribute("data-theme", newTheme);
    root.style.colorScheme = newTheme;
  }, []);

  // Initialize from document class, localStorage, or system preference
  useEffect(() => {
    let resolvedTheme: Theme = "dark";
    try {
      const root = document.documentElement;
      const savedTheme = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (savedTheme === "light" || savedTheme === "dark") {
        resolvedTheme = savedTheme;
      } else if (root.classList.contains("light")) {
        resolvedTheme = "light";
      } else if (root.classList.contains("dark")) {
        resolvedTheme = "dark";
      } else {
        const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
        resolvedTheme = prefersLight ? "light" : "dark";
      }
    } catch {
      resolvedTheme = "dark";
    }

    setThemeState(resolvedTheme);
    applyThemeToDOM(resolvedTheme);
    setMounted(true);
  }, [applyThemeToDOM]);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      applyThemeToDOM(newTheme);
      try {
        localStorage.setItem(STORAGE_KEY, newTheme);
      } catch {}
    },
    [applyThemeToDOM]
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
