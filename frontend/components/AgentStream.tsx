"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, ChevronRight, Cog, Lightbulb, ScanSearch, Workflow, Wrench } from "lucide-react";
import clsx from "clsx";
import type {
  AgentEvidenceEvent,
  AgentFinishedEvent,
  AgentHypothesisEvent,
  AgentName,
  AgentStartEvent,
  AgentThoughtEvent,
  AgentToolCallEvent,
  CrisisEvent,
  Incident,
} from "@/lib/types";

const AGENT_META: Record<
  AgentName,
  { label: string; tag: string; color: string; ring: string; bar: string }
> = {
  MetricsAgent: {
    label: "Metrics Agent",
    tag: "Telemetry",
    color: "text-accent-cyan",
    ring: "border-accent-cyan/30 bg-accent-cyan/10",
    bar: "bg-accent-cyan",
  },
  DeploymentAgent: {
    label: "Deployment Agent",
    tag: "GitLab",
    color: "text-accent-violet",
    ring: "border-accent-violet/30 bg-accent-violet/10",
    bar: "bg-accent-violet",
  },
  RootCauseAgent: {
    label: "Root Cause Agent",
    tag: "Synthesis",
    color: "text-severity-sev2",
    ring: "border-severity-sev2/30 bg-severity-sev2/10",
    bar: "bg-severity-sev2",
  },
  BusinessImpactAgent: {
    label: "Business Impact Agent",
    tag: "Revenue",
    color: "text-accent-mint",
    ring: "border-accent-mint/30 bg-accent-mint/10",
    bar: "bg-accent-mint",
  },
  CommsAgent: {
    label: "Comms Agent",
    tag: "Stakeholder",
    color: "text-severity-sev4",
    ring: "border-severity-sev4/30 bg-severity-sev4/10",
    bar: "bg-severity-sev4",
  },
  TimelineAgent: {
    label: "Timeline Agent",
    tag: "Reconstruct",
    color: "text-white",
    ring: "border-white/30 bg-white/10",
    bar: "bg-white",
  },
};

type AgentState = {
  agent: AgentName;
  objective?: string;
  events: CrisisEvent[];
  confidence: number;
  finished: boolean;
  conclusion?: string;
};

function summarize(incident: Incident): AgentState[] {
  const byAgent = new Map<AgentName, AgentState>();
  for (const ev of incident.events) {
    if (!("agent" in ev)) continue;
    const a = ev.agent as AgentName;
    let s = byAgent.get(a);
    if (!s) {
      s = { agent: a, events: [], confidence: 0, finished: false };
      byAgent.set(a, s);
    }
    s.events.push(ev);
    if (ev.type === "agent.start") s.objective = (ev as AgentStartEvent).objective;
    if (ev.type === "agent.thought") s.confidence = Math.max(s.confidence, (ev as AgentThoughtEvent).confidence);
    if (ev.type === "agent.hypothesis") s.confidence = Math.max(s.confidence, (ev as AgentHypothesisEvent).confidence);
    if (ev.type === "agent.finished") {
      s.finished = true;
      s.confidence = Math.max(s.confidence, (ev as AgentFinishedEvent).confidence);
      s.conclusion = (ev as AgentFinishedEvent).conclusion;
    }
  }
  return Array.from(byAgent.values());
}

function EventLine({ ev }: { ev: CrisisEvent }) {
  if (ev.type === "agent.start") {
    return (
      <div className="flex items-start gap-2 text-[12px] text-white/70">
        <ChevronRight className="mt-0.5 h-3 w-3 text-white/40" />
        <span>
          <span className="text-white/40">Objective: </span>
          {(ev as AgentStartEvent).objective}
        </span>
      </div>
    );
  }
  if (ev.type === "agent.thought") {
    return (
      <div className="flex items-start gap-2 text-[12px] text-white/80">
        <Brain className="mt-0.5 h-3 w-3 text-accent-cyan" />
        <span>{(ev as AgentThoughtEvent).thought}</span>
      </div>
    );
  }
  if (ev.type === "agent.tool_call") {
    const t = ev as AgentToolCallEvent;
    return (
      <div className="flex items-start gap-2 font-mono text-[11px] text-white/60">
        <Wrench className="mt-0.5 h-3 w-3 text-accent-violet" />
        <span>
          {t.tool}
          <span className="text-white/30">(</span>
          {Object.entries(t.args || {})
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
            .join(", ")}
          <span className="text-white/30">)</span>
        </span>
      </div>
    );
  }
  if (ev.type === "agent.evidence") {
    const e = ev as AgentEvidenceEvent;
    return (
      <div className="flex items-start gap-2 text-[12px]">
        <ScanSearch className="mt-0.5 h-3 w-3 text-severity-sev3" />
        <span>
          <span className="font-medium text-white">{e.label}: </span>
          <span className="text-white/70">{e.detail}</span>
        </span>
      </div>
    );
  }
  if (ev.type === "agent.hypothesis") {
    const h = ev as AgentHypothesisEvent;
    return (
      <div className="flex items-start gap-2 text-[12px] text-white/90">
        <Lightbulb className="mt-0.5 h-3 w-3 text-severity-sev2" />
        <span>
          {h.hypothesis}{" "}
          <span className="text-white/40">({Math.round(h.confidence * 100)}% conf.)</span>
        </span>
      </div>
    );
  }
  if (ev.type === "agent.finished") {
    const f = ev as AgentFinishedEvent;
    return (
      <div className="flex items-start gap-2 text-[12px] text-accent-mint">
        <Workflow className="mt-0.5 h-3 w-3" />
        <span>{f.conclusion}</span>
      </div>
    );
  }
  return null;
}

export function AgentStream({ incident }: { incident: Incident }) {
  const agents = useMemo(() => summarize(incident), [incident]);

  return (
    <div className="glass flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">War Room</div>
          <div className="text-sm font-semibold text-white">Agent investigation</div>
        </div>
        <div className="chip text-white/60">
          <Cog className="h-3 w-3 text-accent-cyan animate-spin [animation-duration:4s]" />
          {agents.filter((a) => !a.finished).length} active
        </div>
      </div>

      <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-4">
        {agents.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-white/40">
            Agents will spin up momentarily…
          </div>
        )}
        <AnimatePresence initial={false}>
          {agents.map((a) => {
            const meta = AGENT_META[a.agent];
            return (
              <motion.div
                key={a.agent}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={clsx(
                  "rounded-xl border border-white/[0.06] bg-white/[0.02] p-3",
                  a.finished ? "" : "shadow-glow",
                )}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className={clsx("flex h-6 w-6 items-center justify-center rounded-md border", meta.ring)}>
                    <Brain className={clsx("h-3 w-3", meta.color)} />
                  </span>
                  <span className={clsx("text-xs font-semibold", meta.color)}>{meta.label}</span>
                  <span className="chip text-[10px] text-white/50">{meta.tag}</span>
                  <span className="ml-auto text-[10px] text-white/40">
                    {a.finished ? "Done" : "Investigating…"}
                  </span>
                </div>

                <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round(a.confidence * 100)}%` }}
                    transition={{ type: "spring", stiffness: 80, damping: 20 }}
                    className={clsx("h-full", meta.bar)}
                  />
                </div>

                <div className="space-y-1.5">
                  {a.events.map((ev) => (
                    <EventLine key={ev.id} ev={ev} />
                  ))}
                  {incident.streaming?.[a.agent] && (
                    <div className="flex items-start gap-2 text-[12px] text-white/90">
                      <Brain className={clsx("mt-0.5 h-3 w-3", meta.color)} />
                      <span>
                        {incident.streaming[a.agent]}
                        <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 animate-pulse bg-white/70 align-middle" />
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
