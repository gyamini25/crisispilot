"""Multi-agent orchestrator. Sequences specialized agents and exposes their
collaborative reasoning over the event bus so the UI can render it live."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.agents.business_impact_agent import BusinessImpactAgent
from app.agents.comms_agent import CommsAgent
from app.agents.deployment_agent import DeploymentAgent
from app.agents.metrics_agent import MetricsAgent
from app.agents.root_cause_agent import RootCauseAgent
from app.core.pubsub import bus
from app.db.store import store
from app.models.events import IncidentStatus, IncidentStatusEvent

log = logging.getLogger(__name__)


async def _set_status(incident_id: str, status: IncidentStatus) -> None:
    evt = IncidentStatusEvent(incident_id=incident_id, status=status).model_dump(mode="json")
    await bus.publish(evt)
    await store.append_event(incident_id, evt)
    incident = await store.get_incident(incident_id)
    if incident:
        incident["status"] = status.value
        await store.upsert_incident(incident)


async def investigate(incident: dict[str, Any]) -> None:
    iid = incident["id"]
    log.info("Orchestrator engaging on %s", iid)

    await _set_status(iid, IncidentStatus.INVESTIGATING)

    metrics, deployment, impact = await asyncio.gather(
        MetricsAgent().run(incident),
        DeploymentAgent().run(incident),
        BusinessImpactAgent().run(incident),
    )

    await _set_status(iid, IncidentStatus.IDENTIFIED)

    combined: dict[str, Any] = {**metrics, **deployment, **impact}
    root_findings = await RootCauseAgent().run(incident, combined)
    combined.update(root_findings)

    await CommsAgent().run(incident, combined)
    await _set_status(iid, IncidentStatus.MITIGATING)
