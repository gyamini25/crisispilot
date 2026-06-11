import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CrisisPilot — Autonomous AI Incident Commander",
  description:
    "Real-time autonomous incident intelligence. Detect, investigate, and coordinate resolution at the speed of telemetry.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-accent-cyan/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
