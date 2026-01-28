/**
 * GFAM Agency Color Configuration
 *
 * This file defines all theme colors for light and dark modes.
 * Brand accent colors remain constant across themes.
 */

export const colors = {
  // Primary text colors (swapped between themes)
  primary: {
    light: "#1A1A2E", // Deep Indigo/Navy
    dark: "#F3F4F6",  // Off-white
  },
  secondary: {
    light: "#4B5563", // Cool Gray
    dark: "#D1D5DB",  // Light Gray
  },

  // Gray scale for layering
  grays: {
    50: { light: "#F8F9FA", dark: "#0A0A14" },  // Background base
    100: { light: "#F3F4F6", dark: "#0F0F1A" }, // Secondary background
    200: { light: "#E5E7EB", dark: "#1A1A2E" }, // Tertiary/Cards
    300: { light: "#D1D5DB", dark: "#252540" }, // Hover states
    400: { light: "#9CA3AF", dark: "#2D2D4A" }, // Borders
    500: { light: "#6B7280", dark: "#3D3D5C" }, // Muted text/Input borders
  },

  // Brand accent colors (constant across themes)
  brand: {
    sankofa: "#10B981",    // Emerald - Marketing/Web
    lighthouse: "#8B5CF6", // Purple - Video/Photo
    centex: "#F59E0B",     // Amber - Sports/Live
    gfam: "#3B82F6",       // Blue - Studios/Podcasts
  },

  // Feedback colors
  feedback: {
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
    info: "#3B82F6",
  },

  // KPI icon colors (adjusted for readability in each theme)
  kpiIcons: {
    1: {
      bg: { light: "#D1FAE5", dark: "rgba(16, 185, 129, 0.15)" },
      color: { light: "#059669", dark: "#34D399" },
    },
    2: {
      bg: { light: "#FEF3C7", dark: "rgba(245, 158, 11, 0.15)" },
      color: { light: "#D97706", dark: "#FBBF24" },
    },
    3: {
      bg: { light: "#DBEAFE", dark: "rgba(59, 130, 246, 0.15)" },
      color: { light: "#2563EB", dark: "#60A5FA" },
    },
    4: {
      bg: { light: "#EDE9FE", dark: "rgba(139, 92, 246, 0.15)" },
      color: { light: "#7C3AED", dark: "#A78BFA" },
    },
  },

  // Sidebar colors
  sidebar: {
    bg: { light: "#1A1A2E", dark: "#0A0A14" },
    hover: { light: "#2D2D44", dark: "#1A1A2E" },
    active: { light: "#3D3D5C", dark: "#252540" },
    text: { light: "#9CA3AF", dark: "#6B7280" },
    textActive: { light: "#FFFFFF", dark: "#FFFFFF" },
    border: { light: "#374151", dark: "#252540" },
  },

  // Shadows (CSS shadow values)
  shadows: {
    card: {
      light: "0 1px 3px rgba(0, 0, 0, 0.1)",
      dark: "0 1px 3px rgba(0, 0, 0, 0.3)",
    },
    cardHover: {
      light: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
      dark: "0 10px 25px -5px rgba(0, 0, 0, 0.4)",
    },
  },
};

export default colors;
