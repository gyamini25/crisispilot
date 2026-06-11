"use client";

import { useRef, useState } from "react";
import { Upload, FileText, Loader2, Activity } from "lucide-react";
import clsx from "clsx";
import { uploadFile, type DetectedAnomaly } from "@/lib/api";

export function UploadDropzone() {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{
    filename: string;
    rows: number;
    anomaly: DetectedAnomaly | null;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handle(file?: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const res = await uploadFile(file);
      setLast({ filename: res.filename, rows: res.rows_parsed, anomaly: res.anomaly });
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass-strong p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
            Ingest
          </div>
          <div className="text-sm font-semibold text-white">Drop logs, CSV, JSON</div>
        </div>
        <Upload className="h-4 w-4 text-accent-cyan" />
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer?.files?.[0];
          handle(f);
        }}
        className={clsx(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 text-center transition",
          drag
            ? "border-accent-cyan/60 bg-accent-cyan/[0.08]"
            : "border-white/10 bg-white/[0.015] hover:border-white/20",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".csv,.json,.log,.txt"
          onChange={(e) => handle(e.target.files?.[0])}
        />
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin text-accent-cyan" />
        ) : (
          <FileText className="h-5 w-5 text-white/40" />
        )}
        <div className="text-xs text-white/70">
          {busy ? "Parsing and triaging…" : "Drop a file or click to upload"}
        </div>
        <div className="text-[10px] text-white/40">
          CrisisPilot will detect anomalies and dispatch agents instantly.
        </div>
      </label>

      {last && (
        <div className="mt-3 space-y-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/60">
          <div>
            Ingested <span className="font-mono text-white">{last.filename}</span> · {last.rows} rows
          </div>
          {last.anomaly ? (
            <div className="flex items-start gap-1.5 text-accent-cyan">
              <Activity className="mt-0.5 h-3 w-3" />
              <span>
                <span className="font-semibold">{last.anomaly.column}</span>{" "}
                {last.anomaly.direction === "high" ? "spiked to" : "dropped to"}{" "}
                <span className="font-mono">{last.anomaly.peak_value}</span> ·{" "}
                <span className="font-mono">{last.anomaly.z_score.toFixed(1)}σ</span>{" "}
                from baseline{" "}
                <span className="font-mono text-white/60">{last.anomaly.baseline_median}</span>
              </span>
            </div>
          ) : (
            <div className="text-white/40">No significant anomaly detected ({">"}2.5σ).</div>
          )}
        </div>
      )}
    </div>
  );
}
