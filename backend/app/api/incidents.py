from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.simulator import trigger_incident
from app.db.store import store

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.get("")
async def list_incidents() -> list[dict]:
    return await store.list_incidents()


@router.get("/{incident_id}")
async def get_incident(incident_id: str) -> dict:
    incident = await store.get_incident(incident_id)
    if not incident:
        raise HTTPException(404, "incident not found")
    events = await store.events_for(incident_id)
    return {**incident, "events": events}


@router.post("/trigger")
async def trigger() -> dict:
    incident = await trigger_incident()
    return incident
