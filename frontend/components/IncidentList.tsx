"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Globe2, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { useStore } from "@/lib/store";
import { SeverityPill } from "./SeverityPill";

const statusLabel: Record<string, string> = {
  detected: "Detected",
  investigating: "Investigating",
  identified: "Root cause identified",
  mitigating: "Mitigating",
  resolved: "Resolved",
};

const statusColor: Record<string, string> = {
  detected: "text-severity-sev1",
  investigating: "text-severity-sev2",
  identified: "text-accent-cyan",
  mitigating: "text-accent-mint",
  resolved: "text-white/40",
};

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

export function IncidentList() {
  const { state, select } = useStore();
  const items = state.order.map((id) => state.incidents[id]).filter(Boolean);

  return (
    <aside className="glass flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
            Operations Feed
          </div>
          <div className="text-sm font-semibold text-white">Active incidents</div>
        </div>
        <div className="text-[10px] text-white/40">{items.length} total</div>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {items.length === 0 && (
          <div className="px-4 py-10 text-center text-xs text-white/40">
            Waiting for telemetry…
          </div>
        )}
        <AnimatePresence initial={false}>
          {items.map((inc) => {
            const active = state.selectedId === inc.id;
            return (
              <motion.button
                key={inc.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                onClick={() => select(inc.id)}
                className={clsx(
                  "group flex w-full flex-col gap-2 border-b border-white/[0.04] px-4 py-3 text-left transition",
                  active
                    ? "bg-accent-cyan/[0.06] hover:bg-accent-cyan/[0.08]"
                    : "hover:bg-white/[0.03]",
                )}
              >
                <div className="flex items-center gap-2">
                  <SeverityPill severity={inc.severity} />
                  <span className={clsx("text-[10px] font-medium", statusColor[inc.status])}>
                    {statusLabel[inc.status] ?? inc.status}
                  </span>
                  <span className="ml-auto text-[10px] text-white/40">
                    {relTime(inc.detected_at)}
                  </span>
                </div>
                <div className="text-sm font-semibold text-white/90 leading-snug">
                  {inc.title}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-white/50">
                  <Globe2 className="h-3 w-3" />
                  <span>{inc.service}</span>
                  <span className="text-white/20">·</span>
                  <span>{inc.region}</span>
                  <ChevronRight
                    className={clsx(
                      "ml-auto h-3.5 w-3.5 transition",
                      active ? "text-accent-cyan" : "text-white/20 group-hover:text-white/40",
                    )}
                  />
                </div>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </aside>
  );
}
