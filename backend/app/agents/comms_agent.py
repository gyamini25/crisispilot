from __future__ import annotations

from typing import Any

from app.agents.base import Agent
from app.core.pubsub import bus
from app.db.store import store
from app.models.events import AgentName, RemediationProposedEvent


class CommsAgent(Agent):
    name = AgentName.COMMS
    objective = "Draft a remediation proposal and stakeholder summary."

    async def run(self, incident: dict[str, Any], findings: dict[str, Any]) -> dict[str, Any]:
        iid = incident["id"]
        svc = incident["service"]
        await self.start(iid)
        await self._pause()

        commit = findings.get("root_cause_commit") or "unknown"
        commit_msg = findings.get("commit_msg") or ""
        rpm = findings.get("rpm") or 0.0
        action = f"Rollback deploy {commit} on {svc}"
        rationale = await self.llm(
            f"You are the Comms Agent. Draft a one-paragraph rationale for rolling back deploy {commit} "
            f"('{commit_msg}') on {svc}. Revenue burn is ${rpm:,.0f}/min. Speak to a war-room of senior engineers. "
            "Mention reversibility and risk posture.",
            fallback=(
                f"Root-cause agent identified {commit} as the regression with 86% confidence. "
                f"Rollback is reversible and is the lowest-risk path to mitigation."
            ),
            max_words=55,
            incident_id=iid,
        )

        proposal = RemediationProposedEvent(
            incident_id=iid,
            action=action,
            rationale=rationale,
            confidence=0.86,
        )
        payload = proposal.model_dump(mode="json")
        await bus.publish(payload)
        await store.append_event(iid, payload)

        await self.thought(
            iid,
            await self.llm(
                f"As Comms Agent: announce that a remediation proposal for {commit} on {svc} has been drafted "
                "and a stakeholder update is being posted to #incidents.",
                fallback="Drafting stakeholder update for #incidents.",
                max_words=20,
                incident_id=iid,
            ),
            confidence=0.6,
        )
        await self.finish(
            iid,
            await self.llm(
                f"Comms Agent closing line: the rollback proposal for {commit} is queued for human approval. "
                "Keep it short and confident.",
                fallback="Remediation proposal posted. Awaiting human approval.",
                max_words=18,
                incident_id=iid,
            ),
            confidence=0.82,
        )
        return {"action": action}
