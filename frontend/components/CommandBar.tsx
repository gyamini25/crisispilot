"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Activity, Cpu, Plug, PlugZap, Sparkles, Zap } from "lucide-react";
import clsx from "clsx";
import { useStore } from "@/lib/store";
import { triggerIncident } from "@/lib/api";

export function CommandBar() {
  const { state } = useStore();
  const [busy, setBusy] = useState(false);

  const wsLabel =
    state.wsStatus === "open" ? "Live" : state.wsStatus === "connecting" ? "Connecting…" : "Reconnecting…";
  const wsColor =
    state.wsStatus === "open"
      ? "text-accent-mint"
      : state.wsStatus === "connecting"
      ? "text-severity-sev3"
      : "text-severity-sev1";

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-6">
        <div className="flex items-center gap-3">
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-accent-cyan/30 bg-accent-cyan/10"
          >
            <Cpu className="h-4 w-4 text-accent-cyan" />
            <span className="absolute inset-0 animate-pulse-soft rounded-lg border border-accent-cyan/40" />
          </motion.div>
          <div>
            <div className="text-sm font-semibold tracking-wide text-white">
              CrisisPilot
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
              Autonomous Incident Commander
            </div>
          </div>
        </div>

        <div className="ml-4 hidden items-center gap-2 md:flex">
          <span className="chip text-white/70">
            <Activity className="h-3 w-3 text-accent-cyan" />
            {Object.keys(state.incidents).length} active
          </span>
          <span className={clsx("chip", wsColor)}>
            {state.wsStatus === "open" ? (
              <PlugZap className="h-3 w-3" />
            ) : (
              <Plug className="h-3 w-3" />
            )}
            {wsLabel}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await triggerIncident();
              } finally {
                setTimeout(() => setBusy(false), 800);
              }
            }}
            className="group inline-flex items-center gap-2 rounded-lg border border-accent-cyan/40 bg-accent-cyan/10 px-3 py-1.5 text-xs font-semibold text-accent-cyan transition hover:bg-accent-cyan/20 disabled:opacity-50"
          >
            <Zap className="h-3.5 w-3.5 transition group-hover:rotate-12" />
            Trigger incident
          </button>
          <a
            href="https://anthropic.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.07]"
          >
            <Sparkles className="h-3.5 w-3.5 text-accent-violet" />
            Powered by Gemini
          </a>
        </div>
      </div>
    </header>
  );
}
