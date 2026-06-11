"use client";

import { useMemo } from "react";
import { LineChart } from "lucide-react";
import clsx from "clsx";
import type {
  AgentFinishedEvent,
  AgentHypothesisEvent,
  AgentName,
  AgentThoughtEvent,
  Incident,
} from "@/lib/types";

const TRACKED: { agent: AgentName; label: string; color: string }[] = [
  { agent: "MetricsAgent", label: "Metrics", color: "#3df0ff" },
  { agent: "DeploymentAgent", label: "Deployment", color: "#a26bff" },
  { agent: "BusinessImpactAgent", label: "Business", color: "#5cf0c4" },
  { agent: "RootCauseAgent", label: "Root Cause", color: "#ff9b3d" },
];

const W = 280;
const H = 70;
const PAD_L = 10;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 10;

type Series = { agent: AgentName; label: string; color: string; points: number[] };

function buildSeries(incident: Incident): Series[] {
  const map = new Map<AgentName, number[]>();
  for (const t of TRACKED) map.set(t.agent, []);
  for (const ev of incident.events) {
    if (!("agent" in ev)) continue;
    const a = (ev as { agent: AgentName }).agent;
    if (!map.has(a)) continue;
    let c: number | null = null;
    if (ev.type === "agent.thought") c = (ev as AgentThoughtEvent).confidence;
    else if (ev.type === "agent.hypothesis") c = (ev as AgentHypothesisEvent).confidence;
    else if (ev.type === "agent.finished") c = (ev as AgentFinishedEvent).confidence;
    if (c != null) map.get(a)!.push(c);
  }
  return TRACKED.map((t) => ({ ...t, points: map.get(t.agent) ?? [] }));
}

function pathFor(points: number[], maxLen: number): string {
  if (points.length === 0) return "";
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const stepX = maxLen > 1 ? innerW / (maxLen - 1) : innerW;
  const coords = points.map((p, i) => {
    const x = PAD_L + i * stepX;
    const y = PAD_T + innerH * (1 - p);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return "M " + coords.join(" L ");
}

export function ConfidenceEvolution({ incident }: { incident: Incident }) {
  const series = useMemo(() => buildSeries(incident), [incident]);
  const maxLen = Math.max(2, ...series.map((s) => s.points.length));
  const anyData = series.some((s) => s.points.length > 0);

  return (
    <div className="glass overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
            Confidence Evolution
          </div>
          <div className="mt-0.5 text-sm font-semibold text-white">
            Certainty over time
          </div>
        </div>
        <LineChart className="h-4 w-4 text-white/40" />
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 block h-[70px] w-full"
        preserveAspectRatio="none"
      >
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1={PAD_L}
            x2={W - PAD_R}
            y1={PAD_T + (H - PAD_T - PAD_B) * (1 - g)}
            y2={PAD_T + (H - PAD_T - PAD_B) * (1 - g)}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={1}
          />
        ))}
        {series.map((s) => {
          if (s.points.length === 0) return null;
          const d = pathFor(s.points, maxLen);
          const lastX =
            PAD_L +
            (maxLen > 1
              ? ((s.points.length - 1) * (W - PAD_L - PAD_R)) / (maxLen - 1)
              : W - PAD_L - PAD_R);
          const lastY =
            PAD_T + (H - PAD_T - PAD_B) * (1 - s.points[s.points.length - 1]);
          return (
            <g key={s.agent}>
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.92}
              />
              <circle cx={lastX} cy={lastY} r={2.4} fill={s.color} />
            </g>
          );
        })}
        {!anyData && (
          <text
            x={W / 2}
            y={H / 2 + 4}
            textAnchor="middle"
            fill="rgba(255,255,255,0.3)"
            style={{ font: "10px sans-serif" }}
          >
            awaiting evidence…
          </text>
        )}
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {series.map((s) => {
          const last = s.points[s.points.length - 1] ?? 0;
          return (
            <div key={s.agent} className="flex items-center gap-2 text-[11px]">
              <span
                className="inline-block h-1.5 w-3 rounded-full"
                style={{ background: s.color }}
              />
              <span className="text-white/70">{s.label}</span>
              <span
                className={clsx(
                  "ml-auto font-mono text-[10px]",
                  s.points.length === 0 ? "text-white/30" : "text-white/80",
                )}
              >
                {s.points.length === 0 ? "—" : `${Math.round(last * 100)}%`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
