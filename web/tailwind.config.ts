import type { Config } from "tailwindcss";

/**
 * Clin uses a light-only brand palette (see src/styles/clin-theme.css).
 * `darkMode: "class"` — dark: utilities only apply when <html class="dark">,
 * which we never set, so OS dark mode cannot wash out navy text or flip cards black.
 */
export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        clin: {
          text: "var(--clin-text)",
          muted: "var(--clin-muted)",
          border: "var(--clin-border)",
          surface: "var(--clin-surface)",
          "surface-muted": "var(--clin-surface-muted)",
          accent: "var(--clin-accent)",
          navy: "var(--clin-navy)",
          primary: "var(--clin-primary)",
          "primary-hover": "var(--clin-primary-hover)",
          "primary-soft": "var(--clin-primary-soft)",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
