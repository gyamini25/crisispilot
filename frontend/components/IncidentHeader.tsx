"use client";

import { motion } from "framer-motion";
import { Globe2, Server, Hash, Rewind, FileUp } from "lucide-react";
import clsx from "clsx";
import type { Incident } from "@/lib/types";
import { useReplay } from "@/lib/store";
import { SeverityPill } from "./SeverityPill";

const statusGradient: Record<string, string> = {
  detected: "from-severity-sev1/30 via-severity-sev1/0 to-transparent",
  investigating: "from-severity-sev2/30 via-severity-sev2/0 to-transparent",
  identified: "from-accent-cyan/30 via-accent-cyan/0 to-transparent",
  mitigating: "from-accent-mint/30 via-accent-mint/0 to-transparent",
  resolved: "from-white/20 via-white/0 to-transparent",
};

export function IncidentHeader({ incident }: { incident: Incident }) {
  const replay = useReplay();
  const canReplay = incident.events.length > 1 && !replay.active;

  return (
    <div className={clsx("relative overflow-hidden glass-strong p-4")}>
      <div
        className={clsx(
          "pointer-events-none absolute inset-0 bg-gradient-to-r opacity-90",
          statusGradient[incident.status],
        )}
      />
      <div className="relative">
        <div className="mb-2 flex items-center gap-2">
          <SeverityPill severity={incident.severity} />
          <span className="chip text-[10px] uppercase tracking-widest text-white/60">
            {incident.status}
          </span>
          <span className="chip font-mono text-[10px] text-white/50">
            <Hash className="h-3 w-3" />
            {incident.id}
          </span>
          {incident.source === "upload" && incident.filename && (
            <span className="chip text-[10px] text-accent-cyan">
              <FileUp className="h-3 w-3" />
              {incident.filename}
            </span>
          )}
          {canReplay && (
            <button
              onClick={() => replay.enter(incident.id)}
              className="ml-auto inline-flex items-center gap-1 rounded-full border border-accent-violet/30 bg-accent-violet/[0.10] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent-violet transition hover:bg-accent-violet/[0.18]"
              aria-label="Replay this incident"
            >
              <Rewind className="h-3 w-3" />
              Replay
            </button>
          )}
        </div>
        <motion.h1
          key={incident.id}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl font-semibold leading-tight text-white"
        >
          {incident.title}
        </motion.h1>
        <p className="mt-1 text-sm text-white/60">{incident.summary}</p>
        <div className="mt-3 flex items-center gap-3 text-[11px] text-white/50">
          <span className="flex items-center gap-1">
            <Server className="h-3 w-3" />
            {incident.service}
          </span>
          <span className="flex items-center gap-1">
            <Globe2 className="h-3 w-3" />
            {incident.region}
          </span>
          <span className="font-mono text-white/40">
            detected {new Date(incident.detected_at).toLocaleTimeString()}
          </span>
        </div>
      </div>
    </div>
  );
}
