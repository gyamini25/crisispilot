"""Base agent. Real Gemini calls plug in here; stubbed mode emits scripted reasoning
with realistic pacing so the UI shows live cognition during the demo."""
from __future__ import annotations

import asyncio
import logging
import random
import secrets
from typing import Any

from app.config import settings
from app.core.pubsub import bus
from app.db.store import store
from app.models.events import (
    AgentEvidenceEvent,
    AgentFinishedEvent,
    AgentHypothesisEvent,
    AgentName,
    AgentStartEvent,
    AgentThoughtEvent,
    AgentTokenEvent,
    AgentToolCallEvent,
    TimelineEntryEvent,
)

log = logging.getLogger(__name__)

_gemini_model = None
_gemini_failed = False


def _gemini():
    """Lazy, idempotent Gemini client. Returns None if disabled or initialization failed."""
    global _gemini_model, _gemini_failed
    if _gemini_failed:
        return None
    if _gemini_model is not None:
        return _gemini_model
    if not settings.use_real_gemini:
        return None
    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.gemini_api_key)
        _gemini_model = genai.GenerativeModel("gemini-flash-lite-latest")
        log.info("Gemini live mode enabled (model=gemini-flash-lite-latest)")
        return _gemini_model
    except Exception as exc:  # pragma: no cover
        log.warning("Gemini init failed, falling back to scripted reasoning: %s", exc)
        _gemini_failed = True
        return None


class Agent:
    name: AgentName
    objective: str = "Investigate the incident."

    role_prompt: str = (
        "You are an autonomous SRE agent inside CrisisPilot, a real-time incident commander. "
        "Sound like a senior site-reliability engineer narrating live findings to a war-room. "
        "Be concrete, evidence-grounded, and brief."
    )

    async def _emit(self, event: Any, incident_id: str) -> None:
        payload = event.model_dump(mode="json")
        await bus.publish(payload)
        await store.append_event(incident_id, payload)

    async def _pause(self, lo: float = 0.4, hi: float = 1.1) -> None:
        await asyncio.sleep(random.uniform(lo, hi))

    def _clean_llm_text(self, raw: str) -> str:
        text = (raw or "").strip().strip('"').strip("`")
        if not text:
            return ""
        text = " ".join(text.split())
        for prefix in ("Thought:", "Hypothesis:", "Conclusion:", "Finding:"):
            if text.lower().startswith(prefix.lower()):
                text = text[len(prefix):].lstrip()
        return text

    async def llm(
        self,
        prompt: str,
        fallback: str,
        max_words: int = 30,
        incident_id: str | None = None,
    ) -> str:
        """Stream narration tokens via Gemini; return assembled text.

        When ``incident_id`` is provided, intermediate chunks are emitted as
        ``agent.token`` events so the UI can show text materializing live. The
        final assembled text is returned for the caller to wrap in the matching
        ``agent.thought`` / ``agent.hypothesis`` / ``agent.finished`` event.
        Falls back to ``fallback`` on any error or when Gemini is disabled.
        """
        full = (
            f"{self.role_prompt}\n\n"
            f"Task: {prompt}\n\n"
            f"Constraints: at most {max_words} words. One sentence. "
            "No prefixes, no quotes, no markdown."
        )
        # 1) Google Cloud Agent Builder (ADK): run this agent as a real LlmAgent
        #    through ADK's Runner. Falls through to direct Gemini on any failure.
        if settings.use_adk:
            adk_text = await self._llm_via_adk(full, incident_id)
            if adk_text:
                return self._clean_llm_text(adk_text) or fallback
        # 2) Direct Gemini streaming.
        model = _gemini()
        if model is None:
            return fallback
        stream_id = secrets.token_hex(4)
        parts: list[str] = []
        try:
            response = await model.generate_content_async(full, stream=True)
            async for chunk in response:
                delta = getattr(chunk, "text", None) or ""
                if not delta:
                    continue
                parts.append(delta)
                if incident_id is not None:
                    await self._emit(
                        AgentTokenEvent(
                            incident_id=incident_id,
                            agent=self.name,
                            stream_id=stream_id,
                            text=delta,
                            done=False,
                        ),
                        incident_id,
                    )
            if incident_id is not None:
                await self._emit(
                    AgentTokenEvent(
                        incident_id=incident_id,
                        agent=self.name,
                        stream_id=stream_id,
                        text="",
                        done=True,
                    ),
                    incident_id,
                )
        except Exception as exc:
            log.warning("Gemini stream failed for %s, using fallback: %s", self.name, exc)
            return fallback
        text = self._clean_llm_text("".join(parts))
        return text or fallback

    async def _llm_via_adk(self, task: str, incident_id: str | None) -> str | None:
        """Run this agent's reasoning through its ADK ``LlmAgent`` via the Runner,
        streaming partial tokens as ``agent.token`` events. Returns the assembled
        text, or ``None`` to fall back to the direct Gemini path."""
        try:
            from app.agents.adk_runtime import adk_runtime
        except Exception:  # pragma: no cover - import guard
            return None

        stream_id = secrets.token_hex(4)

        async def on_delta(delta: str) -> None:
            if incident_id is not None:
                await self._emit(
                    AgentTokenEvent(
                        incident_id=incident_id,
                        agent=self.name,
                        stream_id=stream_id,
                        text=delta,
                        done=False,
                    ),
                    incident_id,
                )

        instruction = f"{self.role_prompt} Your specific objective: {self.objective}"
        text = await adk_runtime.run(self.name.value, instruction, task, on_delta=on_delta)
        if text and incident_id is not None:
            await self._emit(
                AgentTokenEvent(
                    incident_id=incident_id,
                    agent=self.name,
                    stream_id=stream_id,
                    text="",
                    done=True,
                ),
                incident_id,
            )
        return text

    async def thought(self, incident_id: str, text: str, confidence: float = 0.0) -> None:
        await self._emit(
            AgentThoughtEvent(incident_id=incident_id, agent=self.name, thought=text, confidence=confidence),
            incident_id,
        )

    async def tool_call(self, incident_id: str, tool: str, **args: Any) -> dict[str, Any] | None:
        """Emit a tool-call event; for ``dynatrace.*`` tools, actually invoke the
        Dynatrace MCP server and surface the live result.

        Returns the live result dict (with ``rows``/``records``) when Dynatrace is
        configured and reachable, else ``None`` so callers fall back to scripted
        values. The emitted event is annotated with ``source``/``rows`` when live
        so the UI can show the data is real."""
        result: dict[str, Any] | None = None
        if tool.startswith("dynatrace.") and settings.use_real_dynatrace:
            result = await self._dynatrace_query(tool, args)
            if result is not None:
                args = {**args, "source": "dynatrace-mcp", "rows": result.get("rows", 0)}
        await self._emit(
            AgentToolCallEvent(incident_id=incident_id, agent=self.name, tool=tool, args=args),
            incident_id,
        )
        return result

    async def _dynatrace_query(self, tool: str, args: dict[str, Any]) -> dict[str, Any] | None:
        """Run a real DQL query via the Dynatrace MCP server. Never raises.

        Routes by tool name: ``dynatrace.deployments`` fetches deployment events,
        anything else runs the metric query.
        """
        try:
            from app.integrations.dynatrace_mcp import dynatrace_mcp

            if "deploy" in tool:
                return await dynatrace_mcp.query_deployments(args.get("service"))
            return await dynatrace_mcp.query_metric(args.get("metric"), args.get("service"))
        except Exception as exc:  # pragma: no cover - defensive
            log.warning("Dynatrace MCP query failed for %s, falling back: %s", self.name, exc)
            return None

    async def evidence(self, incident_id: str, label: str, detail: str, weight: float = 0.5) -> None:
        await self._emit(
            AgentEvidenceEvent(incident_id=incident_id, agent=self.name, label=label, detail=detail, weight=weight),
            incident_id,
        )

    async def hypothesis(self, incident_id: str, hypothesis: str, confidence: float) -> None:
        await self._emit(
            AgentHypothesisEvent(incident_id=incident_id, agent=self.name, hypothesis=hypothesis, confidence=confidence),
            incident_id,
        )

    async def timeline(self, incident_id: str, label: str, detail: str, kind: str = "agent") -> None:
        await self._emit(
            TimelineEntryEvent(incident_id=incident_id, label=label, detail=detail, kind=kind),  # type: ignore[arg-type]
            incident_id,
        )

    async def finish(self, incident_id: str, conclusion: str, confidence: float) -> None:
        await self._emit(
            AgentFinishedEvent(incident_id=incident_id, agent=self.name, conclusion=conclusion, confidence=confidence),
            incident_id,
        )

    async def start(self, incident_id: str) -> None:
        await self._emit(
            AgentStartEvent(incident_id=incident_id, agent=self.name, objective=self.objective),
            incident_id,
        )

    async def run(self, incident: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError
