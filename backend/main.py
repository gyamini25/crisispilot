from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import incidents, uploads, websocket
from app.config import settings
from app.core.simulator import run_simulator

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("crisispilot")


@asynccontextmanager
async def lifespan(app: FastAPI):
    sim_task: asyncio.Task | None = None
    if settings.crisispilot_autostart_simulator:
        sim_task = asyncio.create_task(run_simulator())
        log.info("Incident simulator started")
    if settings.use_real_dynatrace:
        # Warm up the Dynatrace MCP subprocess in the background (first run downloads
        # the npm package) so the first incident's tool call isn't delayed. Failures
        # are swallowed inside the client — agents fall back to scripted reasoning.
        from app.integrations.dynatrace_mcp import dynatrace_mcp

        asyncio.create_task(dynatrace_mcp._ensure())
        log.info("Dynatrace MCP warmup scheduled")
    if settings.use_adk:
        # Initialize the ADK (Agent Builder) runtime up front so the first
        # incident's reasoning runs through it without init latency.
        from app.agents.adk_runtime import adk_runtime

        adk_runtime._init()
        log.info("Agent Builder (ADK) runtime active")
    try:
        yield
    finally:
        if sim_task:
            sim_task.cancel()
            try:
                await sim_task
            except asyncio.CancelledError:
                pass
        if settings.use_real_dynatrace:
            from app.integrations.dynatrace_mcp import dynatrace_mcp

            await dynatrace_mcp.aclose()


app = FastAPI(title="CrisisPilot", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(websocket.router)
app.include_router(incidents.router)
app.include_router(uploads.router)


@app.get("/healthz")
async def healthz() -> dict:
    return {
        "ok": True,
        "stub_mode": not settings.use_real_gemini,
        "mongo": "real" if settings.use_real_mongo else "in-memory",
        "dynatrace": "live" if settings.use_real_dynatrace else "off",
        "agent_builder": "adk" if settings.use_adk else "off",
    }
