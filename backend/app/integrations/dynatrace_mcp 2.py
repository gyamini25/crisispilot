"""Real Dynatrace integration over the official partner MCP server.

The agents historically *named* tools like ``dynatrace.query`` in their tool-call
events without contacting Dynatrace. This module makes those calls real: it
launches Dynatrace's official MCP server (``@dynatrace-oss/dynatrace-mcp-server``)
as a stdio subprocess via ``npx``, speaks MCP to it, and runs DQL queries against
Grail.

Design goals:
- **Lazy + resilient.** Connect on first use; if anything is missing (npx, the
  ``mcp`` SDK, credentials, network) we mark the integration failed and the
  agents transparently fall back to scripted reasoning. The demo never crashes.
- **Single long-lived session.** One subprocess + MCP session for the process
  lifetime. Calls are serialized behind a lock — low volume, avoids interleaving
  on the stdio transport.
- **Schema-discovered.** The exact DQL tool name and its argument key are
  discovered from ``list_tools`` rather than hard-coded, so the integration
  survives version drift in the MCP server.
"""
from __future__ import annotations

import asyncio
import json
import logging
import shutil
from contextlib import AsyncExitStack
from typing import Any

from app.config import settings

log = logging.getLogger("crisispilot.dynatrace")

# Candidate names/args for the DQL-execution tool, most-specific first.
_DQL_TOOL_CANDIDATES = ("execute_dql", "executeDql", "dql")
_DQL_ARG_CANDIDATES = ("dqlStatement", "dql", "query", "statement")


def build_metric_dql(metric: str | None, service: str | None) -> str:
    """Map a coarse ``metric``/``service`` hint to a valid Grail DQL statement.

    Uses Dynatrace built-in service metrics over a 2h window. On a tenant with no
    monitored services this legitimately returns zero rows — that's a data state,
    not a wiring failure, and the agent falls back to its scripted narrative.
    """
    m = (metric or "").lower()
    if "error" in m or "fail" in m:
        return (
            "timeseries failures = sum(dt.service.request.failure_count), "
            "by:{dt.entity.service}, from:now()-2h "
            "| sort arraySum(failures) desc | limit 20"
        )
    # default: latency
    return (
        "timeseries response_time = avg(dt.service.request.response_time), "
        "by:{dt.entity.service}, from:now()-2h "
        "| sort arrayAvg(response_time) desc | limit 20"
    )


def _records(parsed: Any) -> list[Any]:
    """Normalize a parsed execute_dql result into a list of records."""
    if parsed is None:
        return []
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        for key in ("records", "result", "rows", "data"):
            val = parsed.get(key)
            if isinstance(val, list):
                return val
        return [parsed]
    return []


def _parse_tool_result(result: Any) -> Any:
    """Extract usable data from an MCP CallToolResult (structured or text JSON)."""
    structured = getattr(result, "structuredContent", None)
    if structured:
        return structured
    content = getattr(result, "content", None) or []
    texts = [getattr(item, "text", "") or "" for item in content]
    raw = "\n".join(t for t in texts if t).strip()
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return raw


class DynatraceMCP:
    """Lazily-connected client for the Dynatrace MCP server."""

    def __init__(self) -> None:
        self._stack: AsyncExitStack | None = None
        self._session: Any = None
        self._lock = asyncio.Lock()
        self._connected = False
        self._failed = False
        self._tools: dict[str, dict] = {}
        self._dql_tool: str | None = None
        self._dql_arg: str = "dqlStatement"

    @property
    def enabled(self) -> bool:
        return settings.use_real_dynatrace and not self._failed

    async def _ensure(self) -> bool:
        if self._connected:
            return True
        if self._failed or not settings.use_real_dynatrace:
            return False
        async with self._lock:
            if self._connected:
                return True
            if self._failed:
                return False
            try:
                await self._connect()
                self._connected = True
                return True
            except Exception as exc:  # pragma: no cover - environment dependent
                log.warning(
                    "Dynatrace MCP connect failed (agents fall back to scripted): %s", exc
                )
                self._failed = True
                await self._safe_close()
                return False

    async def _connect(self) -> None:
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client

        if shutil.which("npx") is None:
            raise RuntimeError("npx not on PATH — Node.js is required to run the Dynatrace MCP server")

        env_url = settings.dt_environment.strip()
        if ".apps.dynatrace.com" not in env_url:
            log.warning(
                "DT_ENVIRONMENT does not look like a platform URL "
                "(expected https://<env-id>.apps.dynatrace.com, got %r) — "
                "the MCP server will likely reject it.",
                env_url,
            )

        params = StdioServerParameters(
            command="npx",
            args=["-y", "@dynatrace-oss/dynatrace-mcp-server@latest"],
            env={
                "DT_ENVIRONMENT": env_url,
                "DT_PLATFORM_TOKEN": settings.dt_platform_token,
            },
        )

        self._stack = AsyncExitStack()
        read, write = await self._stack.enter_async_context(stdio_client(params))
        session = await self._stack.enter_async_context(ClientSession(read, write))
        # First run downloads the npm package — give it generous headroom.
        await asyncio.wait_for(session.initialize(), timeout=120)
        self._session = session

        listed = await session.list_tools()
        self._tools = {t.name: (t.inputSchema or {}) for t in listed.tools}
        log.info(
            "Dynatrace MCP connected — %d tools available: %s",
            len(self._tools),
            ", ".join(sorted(self._tools)),
        )

        self._dql_tool = next((c for c in _DQL_TOOL_CANDIDATES if c in self._tools), None)
        if self._dql_tool is None:
            self._dql_tool = next((n for n in self._tools if "dql" in n.lower()), None)

        if self._dql_tool:
            props = (self._tools[self._dql_tool].get("properties") or {})
            self._dql_arg = next(
                (c for c in _DQL_ARG_CANDIDATES if c in props),
                next(iter(props), "dqlStatement"),
            )
            log.info("Dynatrace DQL tool=%s arg=%s", self._dql_tool, self._dql_arg)
        else:
            log.warning("Dynatrace MCP exposed no DQL tool; available: %s", sorted(self._tools))

    async def _safe_close(self) -> None:
        if self._stack is not None:
            try:
                await self._stack.aclose()
            except Exception:  # pragma: no cover - best-effort teardown
                pass
            self._stack = None
        self._session = None

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        if not await self._ensure():
            return None
        async with self._lock:
            try:
                result = await asyncio.wait_for(
                    self._session.call_tool(name, arguments), timeout=45
                )
            except Exception as exc:
                log.warning("Dynatrace MCP call_tool(%s) failed: %s", name, exc)
                return None
        return _parse_tool_result(result)

    async def execute_dql(self, dql: str) -> list[Any] | None:
        """Run a DQL statement; returns a list of records (possibly empty), or
        None if the integration is unavailable."""
        if not await self._ensure() or not self._dql_tool:
            return None
        parsed = await self.call_tool(self._dql_tool, {self._dql_arg: dql})
        if parsed is None:
            return None
        return _records(parsed)

    async def query_metric(self, metric: str | None, service: str | None) -> dict[str, Any] | None:
        """High-level helper used by agents: run the metric DQL and summarize."""
        dql = build_metric_dql(metric, service)
        records = await self.execute_dql(dql)
        if records is None:
            return None
        return {"rows": len(records), "dql": dql, "records": records[:5]}

    async def aclose(self) -> None:
        async with self._lock:
            await self._safe_close()
            self._connected = False


# Process-wide singleton — the only thing other modules import.
dynatrace_mcp = DynatraceMCP()
