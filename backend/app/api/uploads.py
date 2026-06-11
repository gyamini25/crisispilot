from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, File, UploadFile

from app.core.anomaly import (
    describe as describe_anomaly,
    detect_anomaly,
    infer_service_region,
    severity_from_z,
)
from app.core.pubsub import bus
from app.core.simulator import trigger_incident
from app.db.store import store
from app.models.events import (
    IncidentDetectedEvent,
    IncidentStatus,
    Severity,
    TimelineEntryEvent,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/uploads", tags=["uploads"])


def _sniff_severity_from_text(text: str) -> Severity:
    lowered = text.lower()
    if any(k in lowered for k in ("sev1", "critical", "p1", "outage")):
        return Severity.SEV1
    if any(k in lowered for k in ("sev2", "p2", "high", "5xx")):
        return Severity.SEV2
    if any(k in lowered for k in ("sev3", "p3", "warning", "regression")):
        return Severity.SEV3
    return Severity.SEV4


def _parse(filename: str | None, text: str) -> list[dict]:
    """Best-effort parse of CSV / JSON uploads into list-of-dicts."""
    if not filename:
        return []
    name = filename.lower()
    if name.endswith(".csv"):
        try:
            reader = csv.DictReader(io.StringIO(text))
            return list(reader)
        except Exception:
            log.exception("CSV parse failed")
    if name.endswith(".json"):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [r for r in parsed if isinstance(r, dict)]
            if isinstance(parsed, dict):
                # Common pattern: {"rows": [...]} or {"data": [...]}
                for key in ("rows", "data", "items", "records"):
                    v = parsed.get(key)
                    if isinstance(v, list):
                        return [r for r in v if isinstance(r, dict)]
                return [parsed]
        except Exception:
            log.exception("JSON parse failed")
    return []


@router.post("")
async def upload(file: UploadFile = File(...)) -> dict:
    raw = await file.read()
    text = raw.decode("utf-8", errors="ignore")
    filename = file.filename or "upload"

    rows = _parse(filename, text)
    anomaly = detect_anomaly(rows) if rows else None

    if anomaly:
        title, summary = describe_anomaly(anomaly, filename)
        severity = severity_from_z(anomaly["z_score"])
        service, region = infer_service_region(rows, anomaly.get("peak_row_idx"), filename)
    else:
        head = text[:400].replace("\n", " ").strip() or f"Ingested {filename} for analysis."
        title = f"Uploaded signal — {filename}"
        summary = head[:240]
        severity = _sniff_severity_from_text(text)
        service, region = infer_service_region(rows, None, filename)

    detected = IncidentDetectedEvent(
        title=title,
        severity=severity,
        service=service,
        region=region,
        summary=summary,
        incident_id="",
    )
    detected.incident_id = detected.id
    payload = detected.model_dump(mode="json")
    await bus.publish(payload)

    incident_record = {
        "id": detected.id,
        "title": detected.title,
        "severity": detected.severity.value,
        "service": detected.service,
        "region": detected.region,
        "summary": detected.summary,
        "status": IncidentStatus.DETECTED.value,
        "detected_at": datetime.now(timezone.utc).isoformat(),
        "source": "upload",
        "filename": filename,
        "row_count": len(rows),
        # Pass the anomaly to the orchestrator so MetricsAgent can use real
        # values from the upload instead of fabricating them.
        "anomaly": anomaly,
    }
    await store.upsert_incident(incident_record)
    await store.append_event(detected.id, payload)

    if anomaly:
        anomaly_detail = (
            f"{anomaly['column']} peaked at {anomaly['peak_value']:g} "
            f"(median {anomaly['baseline_median']:g}, {anomaly['z_score']:.1f}σ) "
            f"across {anomaly['sample_count']} samples"
        )
        ingest_detail = f"{len(raw):,} bytes / {len(rows)} rows · {anomaly_detail}"
    else:
        ingest_detail = (
            f"{len(raw):,} bytes / {len(rows)} rows · no significant anomaly above 2.5σ"
        )

    entry = TimelineEntryEvent(
        incident_id=detected.id,
        label=f"Ingested {filename}",
        detail=ingest_detail,
        kind="user",
    ).model_dump(mode="json")
    await bus.publish(entry)
    await store.append_event(detected.id, entry)

    from app.agents.orchestrator import investigate

    asyncio.create_task(investigate(incident_record))

    return {
        "incident_id": detected.id,
        "filename": filename,
        "size_bytes": len(raw),
        "rows_parsed": len(rows),
        "preview": rows[:5],
        "anomaly": anomaly,
    }


@router.post("/simulate")
async def simulate() -> dict:
    """Convenience endpoint: identical to /api/incidents/trigger but lives next to uploads."""
    return await trigger_incident()
