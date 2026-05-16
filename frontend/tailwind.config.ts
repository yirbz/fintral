import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        brand: {
          primary: "#533afd",
          "primary-deep": "#4434d4",
          "primary-press": "#2e2b8c",
          "primary-soft": "#665efd",
          "primary-subdued": "#b9b9f9",
          "dark-900": "#1c1e54",
          ink: "#0d253d",
          "ink-secondary": "#273951",
          "ink-mute": "#64748d",
          "ink-mute-2": "#61718a",
          "on-primary": "#ffffff",
          canvas: "#ffffff",
          "canvas-soft": "#f6f9fc",
          "canvas-cream": "#f5e9d4",
          hairline: "#e3e8ee",
          "hairline-input": "#a8c3de",
          ruby: "#ea2261",
          magenta: "#f96bee",
          lemon: "#9b6829",
          "shadow-blue": "#003770",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        brand: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) * 0.8)",
        sm: "calc(var(--radius) * 0.6)"
      },
      boxShadow: {
        xs: "0 1px 2px rgba(0,0,0,0.04)",
        card: "0 1px 3px rgba(0,0,0,0.03), 0 1px 2px rgba(0,0,0,0.04)",
        "card-hover": "0 4px 16px rgba(56,189,248,0.08), 0 2px 4px rgba(0,0,0,0.03)",
        elevated: "0 8px 32px rgba(0,0,0,0.06)",
        sidebar: "4px 0 24px rgba(11,17,32,0.25)",
        button: "0 1px 2px rgba(56,189,248,0.08)",
        brand: "0 1px 3px rgba(0,55,112,0.08)",
        "brand-lg": "0 8px 24px rgba(0,55,112,0.08), 0 2px 6px rgba(0,55,112,0.04)",
        "brand-xl": "0 24px 48px -12px rgba(13,37,61,0.4), 0 8px 24px rgba(13,37,61,0.2)",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.4, 0, 0.2, 1)",
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      animation: {
        "fade-in": "animate-in 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        "slide-in": "slide-in 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        pulse: "pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "blob-float": "blob-float 12s ease-in-out infinite",
        "blob-float-2": "blob-float-2 15s ease-in-out infinite",
        "blob-pulse": "blob-pulse 6s ease-in-out infinite",
        "mesh-reveal": "mesh-reveal 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },
      keyframes: {
        "animate-in": {
          "0%": { opacity: "0", transform: "translateY(-4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "slide-in": {
          "0%": { opacity: "0", transform: "translateX(-8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" }
        },
        "blob-float": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "25%": { transform: "translate(30px, -20px) scale(1.03)" },
          "50%": { transform: "translate(-10px, -30px) scale(0.97)" },
          "75%": { transform: "translate(-20px, 10px) scale(1.02)" },
        },
        "blob-float-2": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(-20px, 30px) scale(1.05)" },
          "66%": { transform: "translate(25px, -10px) scale(0.95)" },
        },
        "blob-pulse": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "0.85" },
        },
        "mesh-reveal": {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      }
    }
  },
  plugins: []
};

export default config;
