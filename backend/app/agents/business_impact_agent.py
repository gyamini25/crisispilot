from __future__ import annotations

import random
from typing import Any

from app.agents.base import Agent
from app.core.pubsub import bus
from app.db.store import store
from app.models.events import AgentName, BusinessImpactEvent


SEVERITY_TO_RPM = {
    "SEV1": (8_000, 24_000),
    "SEV2": (1_500, 6_000),
    "SEV3": (200, 900),
    "SEV4": (10, 100),
}

SEVERITY_TO_USERS = {
    "SEV1": (45_000, 220_000),
    "SEV2": (8_000, 40_000),
    "SEV3": (500, 4_000),
    "SEV4": (10, 200),
}


class BusinessImpactAgent(Agent):
    name = AgentName.BUSINESS_IMPACT
    objective = "Estimate revenue, user, and SLA impact in real time."

    async def run(self, incident: dict[str, Any]) -> dict[str, Any]:
        iid = incident["id"]
        sev = incident["severity"]
        svc = incident["service"]
        await self.start(iid)
        await self._pause()

        await self.tool_call(iid, "billing.revenue_per_minute", service=svc, region=incident["region"])
        await self._pause()

        rpm = random.uniform(*SEVERITY_TO_RPM[sev])
        users = random.randint(*SEVERITY_TO_USERS[sev])
        sla_prob = {"SEV1": 0.92, "SEV2": 0.6, "SEV3": 0.25, "SEV4": 0.05}[sev]
        rep_risk = {"SEV1": "severe", "SEV2": "high", "SEV3": "moderate", "SEV4": "low"}[sev]

        impact = BusinessImpactEvent(
            incident_id=iid,
            revenue_loss_usd_per_minute=round(rpm, 2),
            customers_affected=users,
            sla_breach_probability=sla_prob,
            reputational_risk=rep_risk,  # type: ignore[arg-type]
        )
        payload = impact.model_dump(mode="json")
        await bus.publish(payload)
        await store.append_event(iid, payload)

        await self.evidence(iid, "Revenue burn", f"${rpm:,.0f}/min", weight=0.6)
        await self.evidence(iid, "Customers affected", f"{users:,}", weight=0.5)
        await self._pause()

        rollback_thresh = 5_000
        over_threshold = rpm >= rollback_thresh
        await self.hypothesis(
            iid,
            await self.llm(
                f"You are the Business Impact Agent. Revenue burn is ${rpm:,.0f}/min, customers affected "
                f"{users:,}, SLA breach prob {sla_prob:.0%}. Burn {'exceeds' if over_threshold else 'is within'} "
                f"the ${rollback_thresh:,}/min rollback threshold. State the action posture in one sentence.",
                fallback=(
                    f"Burn rate ${rpm:,.0f}/min exceeds rollback threshold — recommend immediate mitigation."
                    if over_threshold
                    else f"Burn rate ${rpm:,.0f}/min within investigation budget — proceed with diagnostic."
                ),
                max_words=24,
                incident_id=iid,
            ),
            confidence=0.68 if over_threshold else 0.58,
        )
        await self.finish(
            iid,
            await self.llm(
                f"Summarize the Business Impact verdict: ${rpm:,.0f}/min burn, {users:,} users affected, "
                f"SLA breach prob {sla_prob:.0%}. One terse line for the war-room.",
                fallback=(
                    f"Estimated burn: ${rpm:,.0f}/min across {users:,} users. SLA breach prob {sla_prob:.0%}."
                ),
                max_words=24,
                incident_id=iid,
            ),
            confidence=0.72,
        )
        return {"rpm": rpm, "users": users}
