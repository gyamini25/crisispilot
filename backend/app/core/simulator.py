"""Synthetic incident generator. Drives the demo when no real telemetry is wired."""
from __future__ import annotations

import asyncio
import logging
import random
from datetime import datetime, timezone

from app.agents.orchestrator import investigate
from app.config import settings
from app.core.pubsub import bus
from app.db.store import store
from app.models.events import (
    IncidentDetectedEvent,
    IncidentStatus,
    Severity,
    TimelineEntryEvent,
)

log = logging.getLogger(__name__)


INCIDENT_TEMPLATES = [
    {
        "title": "Checkout latency spike — EU-West",
        "service": "checkout-api",
        "region": "eu-west-1",
        "summary": "p99 latency on checkout-api crossed 3.5s, error rate climbing.",
        "severity": Severity.SEV1,
    },
    {
        "title": "Order placement failures — US-East",
        "service": "orders-service",
        "region": "us-east-1",
        "summary": "5xx rate on orders-service jumped to 12% over baseline.",
        "severity": Severity.SEV2,
    },
    {
        "title": "Payment gateway degraded",
        "service": "payments-gateway",
        "region": "global",
        "summary": "Stripe webhook acks delayed; settlement queue backing up.",
        "severity": Severity.SEV1,
    },
    {
        "title": "Search relevance regression",
        "service": "search-api",
        "region": "ap-south-1",
        "summary": "CTR dropped 18% after morning deploy. NDCG regression suspected.",
        "severity": Severity.SEV3,
    },
    {
        "title": "Auth token validation slowdown",
        "service": "auth-service",
        "region": "us-west-2",
        "summary": "JWT verification p95 doubled. Downstream services queueing.",
        "severity": Severity.SEV2,
    },
]


async def _emit_incident(template: dict) -> dict:
    detected = IncidentDetectedEvent(
        title=template["title"],
        severity=template["severity"],
        service=template["service"],
        region=template["region"],
        summary=template["summary"],
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
    }
    await store.upsert_incident(incident_record)
    await store.append_event(detected.id, payload)

    timeline = TimelineEntryEvent(
        incident_id=detected.id,
        label="Anomaly detected",
        detail=detected.summary,
        kind="alert",
    ).model_dump(mode="json")
    await bus.publish(timeline)
    await store.append_event(detected.id, timeline)

    return incident_record


async def trigger_incident(template_index: int | None = None) -> dict:
    template = INCIDENT_TEMPLATES[template_index] if template_index is not None else random.choice(INCIDENT_TEMPLATES)
    incident = await _emit_incident(template)
    asyncio.create_task(investigate(incident))
    return incident


async def run_simulator() -> None:
    """Background loop that periodically conjures synthetic incidents."""
    log.info("Simulator running; interval=%ss", settings.crisispilot_incident_interval_seconds)
    # Fire the first one almost immediately so the dashboard isn't empty on load.
    await asyncio.sleep(2)
    await trigger_incident()
    while True:
        await asyncio.sleep(settings.crisispilot_incident_interval_seconds)
        await trigger_incident()
