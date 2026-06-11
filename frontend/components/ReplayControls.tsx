"use client";

import clsx from "clsx";
import { Pause, Play, Rewind, X } from "lucide-react";
import { useReplay } from "@/lib/store";

function fmt(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const SPEEDS = [1, 2, 4, 8];

export function ReplayControls() {
  const replay = useReplay();
  if (!replay.active) return null;

  const pct =
    replay.durationMs > 0
      ? Math.min(100, (replay.cursorMs / replay.durationMs) * 100)
      : 0;

  return (
    <div className="glass relative px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="chip text-[10px] uppercase tracking-[0.18em] text-accent-violet">
          <Rewind className="h-3 w-3" />
          Replay
        </span>

        <button
          onClick={replay.toggle}
          className={clsx(
            "flex h-7 w-7 items-center justify-center rounded-full border transition",
            replay.isPlaying
              ? "border-accent-cyan/40 bg-accent-cyan/15 text-accent-cyan"
              : "border-white/15 bg-white/[0.06] text-white/80 hover:bg-white/[0.10]",
          )}
          aria-label={replay.isPlaying ? "Pause" : "Play"}
          disabled={replay.durationMs === 0}
        >
          {replay.isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>

        <div className="font-mono text-[11px] text-white/60">
          {fmt(replay.cursorMs)} <span className="text-white/30">/</span> {fmt(replay.durationMs)}
        </div>

        <div className="relative flex-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full bg-gradient-to-r from-accent-violet via-accent-cyan to-accent-mint transition-[width]"
              style={{ width: `${pct}%`, transitionDuration: replay.isPlaying ? "80ms" : "0ms" }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(1, replay.durationMs)}
            step={50}
            value={replay.cursorMs}
            onChange={(e) => replay.seek(Number(e.target.value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Scrub through incident"
          />
        </div>

        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => replay.setSpeed(s)}
              className={clsx(
                "rounded-full px-2 py-0.5 text-[10px] font-mono transition",
                s === replay.speed
                  ? "bg-white/15 text-white"
                  : "text-white/50 hover:text-white/80",
              )}
            >
              {s}x
            </button>
          ))}
        </div>

        <button
          onClick={replay.exit}
          className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/70 transition hover:bg-white/[0.07]"
          aria-label="Exit replay"
        >
          <X className="h-3 w-3" />
          Live
        </button>
      </div>
    </div>
  );
}
