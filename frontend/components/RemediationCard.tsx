"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ShieldCheck, X } from "lucide-react";
import type { Incident } from "@/lib/types";

export function RemediationCard({ incident }: { incident: Incident }) {
  const r = incident.remediation;
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);

  return (
    <div className="glass-strong p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
            Proposed Remediation
          </div>
          <div className="text-sm font-semibold text-white">Awaiting human approval</div>
        </div>
        <ShieldCheck className="h-4 w-4 text-accent-mint" />
      </div>

      {!r && (
        <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-white/40">
          CommsAgent is drafting a recommendation…
        </div>
      )}

      <AnimatePresence>
        {r && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="rounded-xl border border-accent-mint/30 bg-accent-mint/[0.06] p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-accent-mint">
                Action
              </div>
              <div className="mt-1 text-sm font-semibold text-white">{r.action}</div>
              <div className="mt-2 text-[11px] leading-relaxed text-white/60">
                {r.rationale}
              </div>
              <div className="mt-2 text-[10px] text-white/40">
                Confidence: {Math.round(r.confidence * 100)}%
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setDecision("approved")}
                disabled={decision !== null}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-accent-mint/40 bg-accent-mint/15 px-3 py-2 text-xs font-semibold text-accent-mint transition hover:bg-accent-mint/25 disabled:opacity-60"
              >
                <Check className="h-3.5 w-3.5" /> Approve rollback
              </button>
              <button
                onClick={() => setDecision("rejected")}
                disabled={decision !== null}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/[0.07] disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" /> Hold
              </button>
            </div>

            {decision && (
              <div className="text-[11px] text-white/50">
                {decision === "approved"
                  ? "Rollback dispatched via GitLab MCP. Mitigation in progress."
                  : "Decision held. CrisisPilot continues to monitor."}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
