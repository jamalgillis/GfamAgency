import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Primary colors (swap between light/dark via CSS variables)
        primary: {
          DEFAULT: "var(--color-primary)",
          50: "var(--color-gray-50)",
          100: "var(--color-gray-100)",
          200: "var(--color-gray-200)",
          300: "var(--color-gray-300)",
          400: "var(--color-gray-400)",
          500: "var(--color-gray-500)",
        },
        // Background layers
        surface: {
          DEFAULT: "var(--color-surface)",
          secondary: "var(--color-surface-secondary)",
          tertiary: "var(--color-surface-tertiary)",
          hover: "var(--color-surface-hover)",
        },
        // Text colors
        content: {
          DEFAULT: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)",
          inverse: "var(--color-text-inverse)",
        },
        // Border colors
        border: {
          DEFAULT: "var(--color-border)",
          light: "var(--color-border-light)",
        },
        // Sidebar specific
        sidebar: {
          DEFAULT: "var(--color-sidebar-bg)",
          hover: "var(--color-sidebar-hover)",
          active: "var(--color-sidebar-active)",
          text: "var(--color-sidebar-text)",
          "text-active": "var(--color-sidebar-text-active)",
          border: "var(--color-sidebar-border)",
        },
        // Brand accent colors (constant across themes)
        brand: {
          sankofa: "#10B981",
          lighthouse: "#8B5CF6",
          centex: "#F59E0B",
          gfam: "#3B82F6",
        },
        // Feedback colors
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
        info: "#3B82F6",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      fontSize: {
        meta: ["0.6875rem", { lineHeight: "1rem" }], // 11px
        "meta-lg": ["0.75rem", { lineHeight: "1rem" }], // 12px
      },
      borderRadius: {
        card: "0.75rem", // 12px
        "card-lg": "1rem", // 16px
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      animation: {
        "fade-in-up": "fadeInUp 0.4s ease-out forwards",
        "slide-in-left": "slideInLeft 0.3s ease-out forwards",
        "bar-grow": "barGrow 0.6s ease-out forwards",
        pulse: "pulse 2s infinite",
        "notif-pulse": "notifPulse 2s infinite",
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideInLeft: {
          from: { opacity: "0", transform: "translateX(-10px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        barGrow: {
          from: { transform: "scaleY(0)" },
          to: { transform: "scaleY(1)" },
        },
        notifPulse: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.1)" },
        },
      },
      spacing: {
        sidebar: "16.25rem", // 260px
        "sidebar-collapsed": "5rem", // 80px
      },
    },
  },
  plugins: [],
};

export default config;
