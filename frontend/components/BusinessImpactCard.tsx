"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { DollarSign, TrendingUp, Users } from "lucide-react";
import clsx from "clsx";
import type { Incident } from "@/lib/types";

const REP_COLORS: Record<string, string> = {
  low: "text-accent-mint border-accent-mint/30 bg-accent-mint/[0.06]",
  moderate: "text-severity-sev3 border-severity-sev3/30 bg-severity-sev3/[0.08]",
  high: "text-severity-sev2 border-severity-sev2/30 bg-severity-sev2/[0.08]",
  severe: "text-severity-sev1 border-severity-sev1/40 bg-severity-sev1/[0.10]",
};

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

export function BusinessImpactCard({ incident }: { incident: Incident }) {
  const impact = incident.impact;

  const detectedAt = useMemo(
    () => new Date(incident.detected_at).getTime(),
    [incident.detected_at],
  );
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedMin = Math.max(0, (now - detectedAt) / 60_000);
  const totalBurn = impact ? impact.revenue_loss_usd_per_minute * elapsedMin : 0;

  return (
    <div className="glass-strong p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
            Business Impact
          </div>
          <div className="text-sm font-semibold text-white">
            Live operational exposure
          </div>
        </div>
        <TrendingUp className="h-4 w-4 text-severity-sev2" />
      </div>

      {!impact && (
        <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-white/40">
          BusinessImpactAgent is estimating exposure…
        </div>
      )}

      {impact && (
        <div className="space-y-3">
          <div className="rounded-xl border border-severity-sev2/30 bg-severity-sev2/[0.06] p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-severity-sev2">
              <DollarSign className="h-3 w-3" /> Revenue burn
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <motion.span
                key={totalBurn.toFixed(0)}
                initial={{ opacity: 0.4 }}
                animate={{ opacity: 1 }}
                className="font-mono text-2xl font-semibold text-white"
              >
                {fmtMoney(totalBurn)}
              </motion.span>
              <span className="text-[11px] text-white/50">
                @ {fmtMoney(impact.revenue_loss_usd_per_minute)}/min
              </span>
            </div>
            <div className="mt-1 text-[10px] text-white/40">
              since detection · {elapsedMin.toFixed(1)} min
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-white/40">
                <Users className="h-3 w-3" /> Customers
              </div>
              <div className="mt-1 font-mono text-base font-semibold text-white">
                {fmtCount(impact.customers_affected)}
              </div>
              <div className="text-[10px] text-white/40">affected</div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-white/40">
                SLA breach
              </div>
              <div className="mt-1 font-mono text-base font-semibold text-white">
                {Math.round(impact.sla_breach_probability * 100)}%
              </div>
              <div className="text-[10px] text-white/40">probability</div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/40">
              Reputational risk
            </div>
            <span
              className={clsx(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                REP_COLORS[impact.reputational_risk] ?? REP_COLORS.moderate,
              )}
            >
              {impact.reputational_risk}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
