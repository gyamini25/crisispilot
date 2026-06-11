"""Anomaly detection for uploaded telemetry.

Given a list of parsed rows (CSV or JSON), find the most extreme spike in any
numeric column using a robust median + MAD score. Returns enough context for
the agents to reason about the spike rather than fabricating random values.
"""
from __future__ import annotations

from statistics import median
from typing import Any

from app.models.events import Severity


# Columns that hint at the affected service or region. Lowercased for matching.
SERVICE_HINTS = {"service", "service_name", "app", "application", "endpoint", "host", "component"}
REGION_HINTS = {"region", "az", "zone", "datacenter", "dc", "location"}

# Columns to ignore when scanning for numeric metrics — these are usually IDs
# or row counters that produce spurious "spikes."
IGNORE_NUMERIC = {"id", "row", "index", "idx", "rowid", "row_id", "seq", "sequence", "n"}


def _to_float(v: Any) -> float | None:
    """Return v as float when possible; ignore strings that aren't pure numbers."""
    if v is None:
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    if isinstance(v, str):
        s = v.strip().replace(",", "")
        if not s:
            return None
        # strip a trailing unit like 'ms', '%', 's' if it makes the prefix numeric
        for sfx in ("ms", "us", "ns", "s", "%", " req/s"):
            if s.lower().endswith(sfx):
                s = s[: -len(sfx)].strip()
                break
        try:
            return float(s)
        except ValueError:
            return None
    return None


def _mad(values: list[float], med: float) -> float:
    if not values:
        return 0.0
    deviations = sorted(abs(v - med) for v in values)
    m = deviations[len(deviations) // 2]
    # 1.4826 makes MAD a consistent estimator of std for normal data
    return 1.4826 * m


def detect_anomaly(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Find the single most-extreme spike across all numeric columns.

    Returns a dict with column, peak_value, baseline_median, baseline_mad,
    z_score, peak_row_idx, sample_count. Returns None if no significant
    spike (z >= 2.5) is found or if there isn't enough data.
    """
    if not rows:
        return None

    # Gather numeric values per column, preserving row index for the peak.
    cols: dict[str, list[tuple[int, float]]] = {}
    for i, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        for k, v in row.items():
            if not isinstance(k, str):
                continue
            if k.lower() in IGNORE_NUMERIC:
                continue
            f = _to_float(v)
            if f is None:
                continue
            cols.setdefault(k, []).append((i, f))

    best: dict[str, Any] | None = None
    for col, pairs in cols.items():
        if len(pairs) < 5:
            continue
        values = [p[1] for p in pairs]
        med = median(values)
        mad = _mad(values, med)
        if mad <= 0:
            continue
        # Pick the single most-deviant point. If multiple points tie, take the
        # latest one — that maps to "the spike just happened."
        peak_idx_local = max(
            range(len(values)),
            key=lambda i: (abs(values[i] - med), i),
        )
        peak_row_idx, peak_value = pairs[peak_idx_local]
        z = abs(peak_value - med) / mad
        if z < 2.5:
            continue
        candidate = {
            "column": col,
            "peak_value": peak_value,
            "peak_row_idx": peak_row_idx,
            "baseline_median": med,
            "baseline_mad": mad,
            "z_score": z,
            "sample_count": len(values),
            "direction": "high" if peak_value >= med else "low",
        }
        if best is None or z > best["z_score"]:
            best = candidate
    return best


def severity_from_z(z: float) -> Severity:
    if z >= 5.0:
        return Severity.SEV1
    if z >= 3.5:
        return Severity.SEV2
    if z >= 2.5:
        return Severity.SEV3
    return Severity.SEV4


def infer_service_region(
    rows: list[dict[str, Any]], peak_row_idx: int | None, filename: str
) -> tuple[str, str]:
    """Pick a service/region from the data. Falls back to filename-derived service."""
    service: str | None = None
    region: str | None = None

    # First, prefer the row that contained the peak — it likely has the relevant
    # service/region columns populated.
    candidates: list[dict[str, Any]] = []
    if peak_row_idx is not None and 0 <= peak_row_idx < len(rows):
        candidates.append(rows[peak_row_idx])
    candidates.extend(r for i, r in enumerate(rows) if i != peak_row_idx)

    for row in candidates:
        if not isinstance(row, dict):
            continue
        for k, v in row.items():
            if not isinstance(k, str) or v is None:
                continue
            lk = k.lower()
            if not service and lk in SERVICE_HINTS:
                sv = str(v).strip()
                if sv:
                    service = sv
            if not region and lk in REGION_HINTS:
                rv = str(v).strip()
                if rv:
                    region = rv
        if service and region:
            break

    if not service:
        base = (filename or "uploaded-service").rsplit("/", 1)[-1]
        base = base.rsplit(".", 1)[0]
        for sfx in ("-metrics", "-logs", "-incident", "-alert", "_metrics", "_logs"):
            if base.lower().endswith(sfx):
                base = base[: -len(sfx)]
                break
        service = base or "uploaded-service"
    if not region:
        region = "uploaded-region"
    return service, region


def describe(anomaly: dict[str, Any], filename: str) -> tuple[str, str]:
    """Title + summary for the IncidentDetectedEvent."""
    col = anomaly["column"]
    peak = anomaly["peak_value"]
    med = anomaly["baseline_median"]
    z = anomaly["z_score"]
    direction = anomaly.get("direction", "high")
    arrow = "↑" if direction == "high" else "↓"
    title = f"{col} anomaly {arrow} {z:.1f}σ from baseline"
    summary = (
        f"{col} {'peaked' if direction == 'high' else 'collapsed'} at {peak:g} "
        f"versus median {med:g} ({z:.1f}σ deviation) in {filename}."
    )
    return title, summary
