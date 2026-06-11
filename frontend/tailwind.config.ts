import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#05070d",
          900: "#0a0e17",
          800: "#0f1623",
          700: "#172033",
          600: "#1f2a44",
          500: "#2b3a5c",
        },
        severity: {
          sev1: "#ff3b5c",
          sev2: "#ff9b3d",
          sev3: "#ffd93d",
          sev4: "#6dd3ff",
        },
        accent: {
          cyan: "#3df0ff",
          violet: "#a26bff",
          mint: "#5cf0c4",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(61,240,255,0.18), 0 12px 40px -12px rgba(61,240,255,0.35)",
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 24px 60px -24px rgba(0,0,0,0.7)",
      },
      backgroundImage: {
        grid: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)",
      },
      animation: {
        "pulse-soft": "pulseSoft 2.4s ease-in-out infinite",
        "scan": "scan 6s linear infinite",
      },
      keyframes: {
        pulseSoft: {
          "0%,100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
