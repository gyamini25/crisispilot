import type { CrisisEvent, Incident } from "./types";

const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_HTTP || "http://localhost:8000";

export async function triggerIncident(): Promise<void> {
  await fetch(`${BACKEND}/api/incidents/trigger`, { method: "POST" });
}

export interface DetectedAnomaly {
  column: string;
  peak_value: number;
  peak_row_idx: number;
  baseline_median: number;
  baseline_mad: number;
  z_score: number;
  sample_count: number;
  direction: "high" | "low";
}

export async function uploadFile(file: File): Promise<{
  incident_id: string;
  filename: string;
  size_bytes: number;
  rows_parsed: number;
  anomaly: DetectedAnomaly | null;
}> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BACKEND}/api/uploads`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return res.json();
}

export async function listIncidents(): Promise<Incident[]> {
  const res = await fetch(`${BACKEND}/api/incidents`);
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  return res.json();
}

export async function getIncidentEvents(id: string): Promise<CrisisEvent[]> {
  const res = await fetch(`${BACKEND}/api/incidents/${id}`);
  if (!res.ok) throw new Error(`get failed: ${res.status}`);
  const inc = (await res.json()) as Incident & { events?: CrisisEvent[] };
  return inc.events ?? [];
}
