"use client";

import { useState, useEffect } from "react";
import { useTheme } from "./ThemeProvider";
import { Sun, Moon } from "lucide-react";

export function ThemeSwitch() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  // Only show the toggle after hydration to prevent mismatches
  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "light" ? "dark" : "light");
  };

  // Show a placeholder during SSR to prevent layout shift
  if (!mounted) {
    return (
      <div className="theme-toggle opacity-0" aria-hidden="true">
        <div className="theme-toggle-thumb" />
      </div>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label={`Switch to ${resolvedTheme === "light" ? "dark" : "light"} theme`}
    >
      {/* Background icons */}
      <Sun
        className="absolute right-2 w-3.5 h-3.5 text-content-muted"
        aria-hidden="true"
      />
      <Moon
        className="absolute left-2 w-3.5 h-3.5 text-content-muted"
        aria-hidden="true"
      />

      {/* Sliding thumb */}
      <div className="theme-toggle-thumb">
        {resolvedTheme === "light" ? (
          <Sun className="w-3 h-3 text-surface" aria-hidden="true" />
        ) : (
          <Moon className="w-3 h-3 text-surface" aria-hidden="true" />
        )}
      </div>
    </button>
  );
}

export default ThemeSwitch;
