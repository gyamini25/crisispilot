"use client";

import { useMemo } from "react";
import clsx from "clsx";
import { Crown, MessagesSquare, Scale } from "lucide-react";
import type {
  AgentHypothesisEvent,
  AgentName,
  Incident,
} from "@/lib/types";

const AGENT_META: Record<AgentName, { label: string; color: string; dot: string }> = {
  MetricsAgent: { label: "Metrics", color: "text-accent-cyan", dot: "bg-accent-cyan" },
  DeploymentAgent: { label: "Deployment", color: "text-accent-violet", dot: "bg-accent-violet" },
  BusinessImpactAgent: { label: "Business Impact", color: "text-accent-mint", dot: "bg-accent-mint" },
  RootCauseAgent: { label: "Root Cause", color: "text-severity-sev2", dot: "bg-severity-sev2" },
  CommsAgent: { label: "Comms", color: "text-severity-sev4", dot: "bg-severity-sev4" },
  TimelineAgent: { label: "Timeline", color: "text-white", dot: "bg-white" },
};

type Claim = { agent: AgentName; text: string; confidence: number; ts: string };

function extractClaims(incident: Incident): { competing: Claim[]; verdict: Claim | null } {
  const competing: Claim[] = [];
  let verdict: Claim | null = null;
  for (const ev of incident.events) {
    if (ev.type !== "agent.hypothesis") continue;
    const h = ev as AgentHypothesisEvent;
    const claim: Claim = {
      agent: h.agent,
      text: h.hypothesis,
      confidence: h.confidence,
      ts: h.ts,
    };
    if (h.agent === "RootCauseAgent") {
      verdict = claim;
    } else {
      competing.push(claim);
    }
  }
  return { competing, verdict };
}

function inferWinner(verdict: Claim | null, competing: Claim[]): AgentName | null {
  if (!verdict) return null;
  const v = verdict.text.toLowerCase();
  // Heuristic: pick the competing claim whose text most overlaps the verdict.
  let best: { agent: AgentName; score: number } | null = null;
  for (const c of competing) {
    const tokens = c.text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    let score = 0;
    for (const t of tokens) {
      if (t.length < 4) continue;
      if (v.includes(t)) score += 1;
    }
    if (!best || score > best.score) best = { agent: c.agent, score };
  }
  return best && best.score > 0 ? best.agent : null;
}

export function DebatePanel({ incident }: { incident: Incident }) {
  const { competing, verdict } = useMemo(() => extractClaims(incident), [incident]);
  const winner = useMemo(() => inferWinner(verdict, competing), [verdict, competing]);

  if (competing.length === 0 && !verdict) {
    return (
      <div className="glass p-4">
        <div className="flex items-center gap-2">
          <MessagesSquare className="h-4 w-4 text-white/40" />
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
            Multi-Agent Debate
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-dashed border-white/10 p-4 text-center text-[11px] text-white/40">
          Agents will table competing hypotheses here…
        </div>
      </div>
    );
  }

  return (
    <div className="glass p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessagesSquare className="h-4 w-4 text-accent-violet" />
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
            Multi-Agent Debate
          </div>
        </div>
        <span className="chip text-[10px] text-white/55">
          <Scale className="h-2.5 w-2.5" /> {competing.length} claims
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {competing
          .slice()
          .sort((a, b) => b.confidence - a.confidence)
          .map((c) => {
            const meta = AGENT_META[c.agent];
            const isWinner = winner === c.agent;
            return (
              <div
                key={`${c.agent}-${c.ts}`}
                className={clsx(
                  "rounded-lg border px-3 py-2 transition",
                  isWinner
                    ? "border-severity-sev2/40 bg-severity-sev2/[0.08]"
                    : "border-white/[0.06] bg-white/[0.025]",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={clsx("h-1.5 w-1.5 rounded-full", meta.dot)} />
                  <span className={clsx("text-[11px] font-semibold", meta.color)}>
                    {meta.label}
                  </span>
                  {isWinner && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-severity-sev2/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-severity-sev2">
                      <Crown className="h-2.5 w-2.5" /> selected
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[10px] text-white/60">
                    {Math.round(c.confidence * 100)}%
                  </span>
                </div>
                <div className="mt-1 text-[12px] leading-snug text-white/80">
                  {c.text}
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={clsx("h-full", meta.dot)}
                    style={{ width: `${Math.round(c.confidence * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
      </div>

      {verdict && (
        <div className="mt-3 rounded-lg border border-severity-sev2/30 bg-gradient-to-br from-severity-sev2/[0.10] to-transparent p-3">
          <div className="flex items-center gap-2">
            <Crown className="h-3 w-3 text-severity-sev2" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-severity-sev2">
              Synthesis
            </span>
            <span className="ml-auto font-mono text-[10px] text-severity-sev2/90">
              {Math.round(verdict.confidence * 100)}%
            </span>
          </div>
          <div className="mt-1 text-[12px] leading-snug text-white/85">
            {verdict.text}
          </div>
        </div>
      )}
    </div>
  );
}
