"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import clsx from "clsx";
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Loader2,
  Zap,
} from "lucide-react";
import type {
  AgentFinishedEvent,
  AgentHypothesisEvent,
  AgentName,
  AgentThoughtEvent,
  Incident,
} from "@/lib/types";

const COL_WIDTH = 220;
const ROW_HEIGHT = 110;

type PipelineItem = {
  id: string;
  agent?: AgentName;
  label: string;
  col: number;
  row: number;
};

const PIPELINE: PipelineItem[] = [
  { id: "incident", label: "Incident", col: 0, row: 1 },
  { id: "MetricsAgent", agent: "MetricsAgent", label: "Metrics", col: 1, row: 0 },
  { id: "DeploymentAgent", agent: "DeploymentAgent", label: "Deployment", col: 1, row: 1 },
  { id: "BusinessImpactAgent", agent: "BusinessImpactAgent", label: "Business Impact", col: 1, row: 2 },
  { id: "RootCauseAgent", agent: "RootCauseAgent", label: "Root Cause", col: 2, row: 1 },
  { id: "CommsAgent", agent: "CommsAgent", label: "Comms / Remediation", col: 3, row: 1 },
];

type AgentState = {
  state: "idle" | "active" | "done";
  confidence: number;
  summary?: string;
  evidenceCount: number;
};

function deriveAgentState(incident: Incident, agent: AgentName): AgentState {
  let started = false;
  let finished = false;
  let confidence = 0;
  let summary: string | undefined;
  let evidenceCount = 0;
  for (const ev of incident.events) {
    if (!("agent" in ev) || (ev as { agent: AgentName }).agent !== agent) continue;
    if (ev.type === "agent.start") started = true;
    if (ev.type === "agent.thought") {
      confidence = Math.max(confidence, (ev as AgentThoughtEvent).confidence);
    }
    if (ev.type === "agent.hypothesis") {
      confidence = Math.max(confidence, (ev as AgentHypothesisEvent).confidence);
      if (!summary) summary = (ev as AgentHypothesisEvent).hypothesis;
    }
    if (ev.type === "agent.evidence") evidenceCount += 1;
    if (ev.type === "agent.finished") {
      finished = true;
      confidence = Math.max(confidence, (ev as AgentFinishedEvent).confidence);
      summary = (ev as AgentFinishedEvent).conclusion;
    }
  }
  let state: AgentState["state"] = "idle";
  if (finished) state = "done";
  else if (started) state = "active";
  return { state, confidence, summary, evidenceCount };
}

const AGENT_COLORS: Record<
  AgentName,
  { text: string; bar: string; glow: string }
> = {
  MetricsAgent: {
    text: "text-accent-cyan",
    bar: "bg-accent-cyan",
    glow: "shadow-[0_0_0_1px_rgba(61,240,255,0.45),0_12px_30px_-12px_rgba(61,240,255,0.6)]",
  },
  DeploymentAgent: {
    text: "text-accent-violet",
    bar: "bg-accent-violet",
    glow: "shadow-[0_0_0_1px_rgba(162,107,255,0.45),0_12px_30px_-12px_rgba(162,107,255,0.6)]",
  },
  BusinessImpactAgent: {
    text: "text-accent-mint",
    bar: "bg-accent-mint",
    glow: "shadow-[0_0_0_1px_rgba(92,240,196,0.45),0_12px_30px_-12px_rgba(92,240,196,0.6)]",
  },
  RootCauseAgent: {
    text: "text-severity-sev2",
    bar: "bg-severity-sev2",
    glow: "shadow-[0_0_0_1px_rgba(255,155,61,0.5),0_12px_30px_-12px_rgba(255,155,61,0.7)]",
  },
  CommsAgent: {
    text: "text-severity-sev4",
    bar: "bg-severity-sev4",
    glow: "shadow-[0_0_0_1px_rgba(109,211,255,0.45),0_12px_30px_-12px_rgba(109,211,255,0.6)]",
  },
  TimelineAgent: {
    text: "text-white",
    bar: "bg-white",
    glow: "shadow-[0_0_0_1px_rgba(255,255,255,0.25)]",
  },
};

type IncidentNodeData = { title: string; service: string };

function IncidentNode({ data }: NodeProps) {
  const d = data as IncidentNodeData;
  return (
    <div className="relative w-[180px] rounded-xl border border-severity-sev1/40 bg-severity-sev1/[0.08] p-3 text-left backdrop-blur-md">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-severity-sev1" />
        <span className="text-[10px] uppercase tracking-[0.18em] text-severity-sev1">
          Incident
        </span>
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-white">{d.title}</div>
      <div className="mt-0.5 truncate text-[11px] text-white/50">{d.service}</div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-severity-sev1"
      />
    </div>
  );
}

type AgentNodeData = AgentState & { label: string; agent: AgentName };

function AgentNode({ data }: NodeProps) {
  const d = data as AgentNodeData;
  const colors = AGENT_COLORS[d.agent];
  const StatusIcon =
    d.state === "done" ? CheckCircle2 : d.state === "active" ? Loader2 : Activity;
  return (
    <div
      className={clsx(
        "relative w-[200px] rounded-xl border bg-white/[0.025] p-3 backdrop-blur-md transition-all duration-300",
        d.state === "active" ? `border-white/10 ${colors.glow}` : "border-white/[0.06]",
        d.state === "idle" && "opacity-55",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-white/40"
      />
      <div className="flex items-center gap-2">
        <Brain className={clsx("h-3.5 w-3.5", colors.text)} />
        <span className={clsx("text-xs font-semibold", colors.text)}>{d.label}</span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-white/55">
          <StatusIcon
            className={clsx("h-3 w-3", d.state === "active" && "animate-spin")}
          />
          {d.state === "done" ? "Done" : d.state === "active" ? "Live" : "Idle"}
        </span>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={clsx("h-full transition-all duration-700", colors.bar)}
          style={{ width: `${Math.round(d.confidence * 100)}%` }}
        />
      </div>

      <div className="mt-2 line-clamp-2 text-[11px] leading-snug text-white/70">
        {d.summary ?? (d.state === "idle" ? "Waiting upstream…" : "Investigating…")}
      </div>

      {d.evidenceCount > 0 && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/60">
          <Zap className="h-2.5 w-2.5" /> {d.evidenceCount} evidence
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-white/40"
      />
    </div>
  );
}

const nodeTypes = { incident: IncidentNode, agent: AgentNode };

export function ReasoningGraph({ incident }: { incident: Incident }) {
  const { nodes, edges } = useMemo(() => {
    const statuses = new Map<AgentName, AgentState>();
    for (const item of PIPELINE) {
      if (item.agent) statuses.set(item.agent, deriveAgentState(incident, item.agent));
    }

    const nodes: Node[] = PIPELINE.map((item) => {
      const x = item.col * COL_WIDTH;
      const y = item.row * ROW_HEIGHT;
      if (item.id === "incident") {
        return {
          id: item.id,
          type: "incident",
          position: { x, y },
          data: {
            title: incident.title,
            service: `${incident.service} · ${incident.region}`,
          },
          draggable: false,
          selectable: false,
        } as Node;
      }
      const s = statuses.get(item.agent!)!;
      return {
        id: item.id,
        type: "agent",
        position: { x, y },
        data: {
          label: item.label,
          state: s.state,
          confidence: s.confidence,
          summary: s.summary,
          evidenceCount: s.evidenceCount,
          agent: item.agent,
        },
        draggable: false,
        selectable: false,
      } as Node;
    });

    const edgeDef: [string, string][] = [
      ["incident", "MetricsAgent"],
      ["incident", "DeploymentAgent"],
      ["incident", "BusinessImpactAgent"],
      ["MetricsAgent", "RootCauseAgent"],
      ["DeploymentAgent", "RootCauseAgent"],
      ["BusinessImpactAgent", "RootCauseAgent"],
      ["RootCauseAgent", "CommsAgent"],
    ];

    const edges: Edge[] = edgeDef.map(([src, dst]) => {
      const source: AgentState =
        src === "incident"
          ? { state: "done", confidence: 1, evidenceCount: 0 }
          : statuses.get(src as AgentName)!;
      const target = statuses.get(dst as AgentName)!;
      const flowing = source.state === "done" && target.state === "active";
      const done = source.state === "done" && target.state === "done";
      return {
        id: `${src}->${dst}`,
        source: src,
        target: dst,
        type: "smoothstep",
        animated: flowing,
        style: {
          stroke: done
            ? "rgba(92,240,196,0.55)"
            : flowing
              ? "rgba(61,240,255,0.7)"
              : source.state === "done"
                ? "rgba(255,255,255,0.18)"
                : "rgba(255,255,255,0.08)",
          strokeWidth: flowing ? 1.8 : 1.4,
        },
      };
    });

    return { nodes, edges };
  }, [incident]);

  return (
    <div className="glass relative h-[280px] w-full overflow-hidden">
      <div className="pointer-events-none absolute left-4 top-3 z-10 flex items-center gap-2">
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
          Reasoning Graph
        </div>
        <span className="chip text-[10px] text-white/55">live topology</span>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        panOnDrag={false}
        panOnScroll={false}
        preventScrolling={false}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(255,255,255,0.06)"
        />
      </ReactFlow>
    </div>
  );
}
