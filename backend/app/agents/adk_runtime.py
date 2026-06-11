"""Google Cloud Agent Builder runtime — ADK (Agent Development Kit).

This is what makes CrisisPilot's agents genuine *Agent Builder* agents rather
than direct SDK calls: each agent is wrapped as a real ADK ``LlmAgent`` and its
reasoning is executed through ADK's ``Runner``. It plugs in at the
``Agent.llm()`` chokepoint — when enabled, narration is produced by running the
agent's ``LlmAgent`` through the Runner (streaming partial tokens when the model
supports it), with graceful fallback to the direct Gemini path and then to
scripted text.

Resilient by design: if ``google-adk`` is missing, ADK init fails, or a run
errors (e.g. Gemini quota 429), ``run()`` returns ``None`` and the caller falls
back. The demo never breaks.
"""
from __future__ import annotations

import asyncio
import logging
import os
import secrets
from typing import Any, Awaitable, Callable, Optional

from app.config import settings

log = logging.getLogger("crisispilot.adk")

_APP_NAME = "crisispilot"
_MODEL = "gemini-flash-lite-latest"

OnDelta = Callable[[str], Awaitable[None]]


class AdkRuntime:
    """Lazily-initialized ADK runtime holding one Runner per agent."""

    def __init__(self) -> None:
        self._ok = False
        self._failed = False
        self._session_service: Any = None
        self._runners: dict[str, Any] = {}
        self._run_config: Any = None
        self._lock = asyncio.Lock()

    @property
    def enabled(self) -> bool:
        return settings.use_adk and not self._failed

    def _init(self) -> bool:
        if self._ok:
            return True
        if self._failed or not settings.use_adk:
            return False
        try:
            # Route google-genai (ADK's model backend) to AI Studio with the
            # existing Gemini key — no Vertex/GCP project required to run ADK.
            if settings.gemini_api_key:
                os.environ.setdefault("GOOGLE_API_KEY", settings.gemini_api_key)
            os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "FALSE")

            from google.adk.sessions import InMemorySessionService

            self._session_service = InMemorySessionService()
            self._run_config = self._build_streaming_config()
            self._ok = True
            log.info("ADK runtime initialized (model=%s, backend=AI Studio)", _MODEL)
            return True
        except Exception as exc:  # pragma: no cover - environment dependent
            log.warning("ADK init failed, falling back to direct Gemini: %s", exc)
            self._failed = True
            return False

    @staticmethod
    def _build_streaming_config() -> Any:
        """Best-effort token streaming via RunConfig(SSE). None if unavailable."""
        try:
            from google.adk.agents.run_config import RunConfig, StreamingMode

            return RunConfig(streaming_mode=StreamingMode.SSE)
        except Exception:
            return None

    def _runner_for(self, agent_key: str, instruction: str) -> Any:
        runner = self._runners.get(agent_key)
        if runner is None:
            from google.adk.agents import LlmAgent
            from google.adk.runners import Runner

            agent = LlmAgent(
                name=agent_key,
                model=_MODEL,
                description=f"CrisisPilot {agent_key}: autonomous SRE incident-response agent.",
                instruction=instruction,
            )
            runner = Runner(
                app_name=_APP_NAME, agent=agent, session_service=self._session_service
            )
            self._runners[agent_key] = runner
        return runner

    async def run(
        self,
        agent_key: str,
        instruction: str,
        task: str,
        on_delta: Optional[OnDelta] = None,
    ) -> str | None:
        """Run a single-turn generation through ADK's Runner. Returns the final
        text, or ``None`` if ADK is unavailable or the run fails."""
        if not self._init():
            return None
        from google.genai import types

        try:
            runner = self._runner_for(agent_key, instruction)
            user_id = "warroom"
            session_id = secrets.token_hex(6)
            await self._session_service.create_session(
                app_name=_APP_NAME, user_id=user_id, session_id=session_id
            )
            content = types.Content(role="user", parts=[types.Part(text=task)])

            final_text = ""
            kwargs: dict[str, Any] = dict(
                user_id=user_id, session_id=session_id, new_message=content
            )
            if self._run_config is not None:
                kwargs["run_config"] = self._run_config

            async for event in runner.run_async(**kwargs):
                joined = _event_text(event)
                if not joined:
                    continue
                if getattr(event, "partial", False):
                    if on_delta is not None:
                        await on_delta(joined)
                elif _is_final(event):
                    final_text = joined
            return final_text.strip() or None
        except Exception as exc:
            log.warning("ADK run failed for %s, falling back: %s", agent_key, exc)
            return None


def _event_text(event: Any) -> str:
    content = getattr(event, "content", None)
    parts = getattr(content, "parts", None) if content else None
    if not parts:
        return ""
    return "".join(getattr(p, "text", "") or "" for p in parts)


def _is_final(event: Any) -> bool:
    fn = getattr(event, "is_final_response", None)
    if callable(fn):
        try:
            return bool(fn())
        except Exception:
            return False
    return False


# Process-wide singleton.
adk_runtime = AdkRuntime()
