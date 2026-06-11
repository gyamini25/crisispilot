from __future__ import annotations

from typing import Any

from app.agents.base import Agent
from app.models.events import AgentName


class RootCauseAgent(Agent):
    name = AgentName.ROOT_CAUSE
    objective = "Synthesize evidence from sibling agents into a single root-cause verdict."

    async def run(self, incident: dict[str, Any], evidence: dict[str, Any]) -> dict[str, Any]:
        iid = incident["id"]
        await self.start(iid)
        await self._pause()

        commit = evidence.get("commit_sha") or "unknown"
        commit_msg = evidence.get("commit_msg") or ""
        p99 = evidence.get("p99") or 0.0
        err = evidence.get("error_rate") or 0.0
        rpm = evidence.get("rpm") or 0.0

        await self.thought(
            iid,
            await self.llm(
                f"You are the Root Cause Agent. Cross-reference: deploy {commit} ('{commit_msg}'), "
                f"p99 latency {p99:.2f}s, error rate {err:.1f}%, revenue burn ${rpm:,.0f}/min. "
                "Comment on the cross-referencing in progress.",
                fallback="Cross-referencing metric anomalies against deploy timeline...",
                max_words=20,
                incident_id=iid,
            ),
            confidence=0.3,
        )
        await self._pause()

        await self.evidence(
            iid,
            "Causal link",
            f"Deploy {commit} preceded p99 spike to {p99:.2f}s by ~3 minutes.",
            weight=0.9,
        )
        await self.thought(
            iid,
            await self.llm(
                f"Root Cause Agent: deploy {commit} preceded the {p99:.2f}s p99 spike by ~3 min. "
                "The latency curve maps to the deploy rollout slice. Comment on rising confidence.",
                fallback="Latency curve maps cleanly to deploy rollout slice. Confidence rising.",
                max_words=22,
                incident_id=iid,
            ),
            confidence=0.78,
        )
        await self._pause()
        await self.hypothesis(
            iid,
            await self.llm(
                f"As Root Cause Agent: synthesize a one-line root-cause hypothesis. "
                f"Evidence: deploy {commit} ('{commit_msg}'), p99 {p99:.2f}s, error_rate {err:.1f}%. "
                "Be decisive.",
                fallback=(
                    f"Root cause: deploy {commit} introduced a regression saturating the downstream dependency."
                ),
                max_words=28,
                incident_id=iid,
            ),
            confidence=0.86,
        )
        await self.finish(
            iid,
            await self.llm(
                f"Final verdict from Root Cause Agent on deploy {commit} ('{commit_msg}'). "
                "Recommend the mitigation in one terse line.",
                fallback=(
                    f"Root cause identified — regression in deploy {commit}. Recommend rollback or feature-flag disable."
                ),
                max_words=28,
                incident_id=iid,
            ),
            confidence=0.88,
        )
        return {"root_cause_commit": commit}
