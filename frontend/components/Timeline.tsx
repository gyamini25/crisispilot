"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Brain, GitBranch, Upload, Activity } from "lucide-react";
import clsx from "clsx";
import type { Incident, TimelineEntryEvent } from "@/lib/types";

const KIND_ICON = {
  alert: AlertTriangle,
  deploy: GitBranch,
  agent: Brain,
  user: Upload,
  metric: Activity,
};

const KIND_COLOR = {
  alert: "text-severity-sev1",
  deploy: "text-accent-violet",
  agent: "text-accent-cyan",
  user: "text-accent-mint",
  metric: "text-severity-sev3",
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function Timeline({ incident }: { incident: Incident }) {
  const entries = incident.events.filter((e) => e.type === "timeline.entry") as TimelineEntryEvent[];

  return (
    <div className="glass flex flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
            Incident Timeline
          </div>
          <div className="text-sm font-semibold text-white">{entries.length} entries</div>
        </div>
      </div>
      <div className="scrollbar-thin max-h-[260px] overflow-y-auto p-4">
        {entries.length === 0 && (
          <div className="text-center text-xs text-white/40">Timeline empty…</div>
        )}
        <ul className="space-y-3">
          {entries.map((entry, idx) => {
            const Icon = KIND_ICON[entry.kind] ?? Activity;
            const color = KIND_COLOR[entry.kind] ?? "text-white/60";
            return (
              <motion.li
                key={entry.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                className="flex items-start gap-3"
              >
                <div className="relative mt-0.5">
                  <span
                    className={clsx(
                      "flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/5",
                      color,
                    )}
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  {idx < entries.length - 1 && (
                    <span className="absolute left-1/2 top-6 h-4 w-px -translate-x-1/2 bg-white/10" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-white">{entry.label}</span>
                    <span className="ml-auto font-mono text-[10px] text-white/40">
                      {fmtTime(entry.ts)}
                    </span>
                  </div>
                  <div className="text-[11px] text-white/55">{entry.detail}</div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
