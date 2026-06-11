"""Incident persistence. Two implementations share a single interface:

- ``IncidentStore`` — in-memory, used when ``MONGODB_URI`` is unset. Demo-safe,
  zero-config, instant reads.
- ``MongoIncidentStore`` — Motor-backed Atlas adapter, activated automatically
  when ``MONGODB_URI`` is set. Same surface so the rest of the app is unaware.

The ``store`` singleton at the bottom is the only thing other modules import.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.config import settings

log = logging.getLogger(__name__)


class IncidentStore:
    """In-memory store. Adapter shape matches a MongoDB collection."""

    def __init__(self) -> None:
        self._incidents: dict[str, dict[str, Any]] = {}
        self._events: dict[str, list[dict[str, Any]]] = {}
        self._lock = asyncio.Lock()

    async def upsert_incident(self, incident: dict[str, Any]) -> None:
        async with self._lock:
            existing = self._incidents.get(incident["id"], {})
            existing.update(incident)
            self._incidents[incident["id"]] = existing

    async def append_event(self, incident_id: str, event: dict[str, Any]) -> None:
        async with self._lock:
            self._events.setdefault(incident_id, []).append(event)

    async def list_incidents(self) -> list[dict[str, Any]]:
        async with self._lock:
            return sorted(
                self._incidents.values(),
                key=lambda i: i.get("detected_at", ""),
                reverse=True,
            )

    async def get_incident(self, incident_id: str) -> dict[str, Any] | None:
        async with self._lock:
            return self._incidents.get(incident_id)

    async def events_for(self, incident_id: str) -> list[dict[str, Any]]:
        async with self._lock:
            return list(self._events.get(incident_id, []))


class MongoIncidentStore:
    """Motor-backed MongoDB Atlas store. Same interface as IncidentStore."""

    def __init__(self, uri: str, db_name: str) -> None:
        from motor.motor_asyncio import AsyncIOMotorClient

        self._client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5_000)
        self._db = self._client[db_name]
        self._incidents = self._db["incidents"]
        self._events = self._db["events"]
        self._indexes_ready = False
        self._index_lock = asyncio.Lock()

    async def _ensure_indexes(self) -> None:
        if self._indexes_ready:
            return
        async with self._index_lock:
            if self._indexes_ready:
                return
            await self._events.create_index([("incident_id", 1), ("ts", 1)])
            await self._incidents.create_index([("detected_at", -1)])
            self._indexes_ready = True

    async def upsert_incident(self, incident: dict[str, Any]) -> None:
        await self._ensure_indexes()
        doc = {**incident, "_id": incident["id"]}
        await self._incidents.update_one(
            {"_id": incident["id"]},
            {"$set": doc},
            upsert=True,
        )

    async def append_event(self, incident_id: str, event: dict[str, Any]) -> None:
        await self._ensure_indexes()
        doc = {**event, "incident_id": incident_id}
        await self._events.insert_one(doc)

    async def list_incidents(self) -> list[dict[str, Any]]:
        await self._ensure_indexes()
        cursor = self._incidents.find({}, projection={"_id": False}).sort("detected_at", -1)
        return [doc async for doc in cursor]

    async def get_incident(self, incident_id: str) -> dict[str, Any] | None:
        await self._ensure_indexes()
        return await self._incidents.find_one(
            {"_id": incident_id},
            projection={"_id": False},
        )

    async def events_for(self, incident_id: str) -> list[dict[str, Any]]:
        await self._ensure_indexes()
        cursor = self._events.find(
            {"incident_id": incident_id},
            projection={"_id": False},
        ).sort("ts", 1)
        return [doc async for doc in cursor]


def _build_store() -> IncidentStore | MongoIncidentStore:
    if settings.use_real_mongo:
        try:
            inst = MongoIncidentStore(settings.mongodb_uri, settings.mongodb_db)
            log.info("MongoDB Atlas store enabled (db=%s)", settings.mongodb_db)
            return inst
        except Exception as exc:
            log.warning("Mongo init failed, falling back to in-memory: %s", exc)
    log.info("Using in-memory incident store")
    return IncidentStore()


store: IncidentStore | MongoIncidentStore = _build_store()
