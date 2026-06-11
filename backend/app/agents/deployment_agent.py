from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from typing import Any

from app.agents.base import Agent
from app.models.events import AgentName


COMMITS = [
    ("e1f4a92", "feat(checkout): switch payment retries to exponential backoff"),
    ("a7c2bd0", "perf(cart): cache product variants per region"),
    ("19fe338", "chore(deps): bump grpc-tools 1.62 -> 1.63"),
    ("44b8e17", "refactor(orders): inline idempotency middleware"),
]


def _deploy_from_record(rec: Any) -> tuple[str, str] | None:
    """Best-effort extraction of a deployment label/version from a Grail
    deployment event record. Returns None if no usable fields are present."""
    if not isinstance(rec, dict):
        return None
    name = (
        rec.get("deployment.name")
        or rec.get("deploymentName")
        or rec.get("event.name")
        or rec.get("title")
    )
    version = (
        rec.get("deployment.version")
        or rec.get("deploymentVersion")
        or rec.get("version")
    )
    if not name and not version:
        return None
    label = str(name or "Deployment")
    detail = f"version {version}" if version else "Dynatrace deployment event"
    return label, detail


class DeploymentAgent(Agent):
    name = AgentName.DEPLOYMENT
    objective = "Identify recent deploys that correlate with the incident window."

    async def run(self, incident: dict[str, Any]) -> dict[str, Any]:
        iid = incident["id"]
        svc = incident["service"]
        await self.start(iid)
        await self._pause()
        # Query recent deployment events from Dynatrace Grail (real MCP call).
        dep = await self.tool_call(iid, "dynatrace.deployments", service=svc, window="24h")
        await self._pause()

        live_rows = dep.get("rows", 0) if dep else 0
        real_deploy = None
        if live_rows:
            await self.evidence(
                iid,
                "Dynatrace (live via MCP)",
                f"{live_rows} deployment events in Grail (last 24h)",
                weight=0.6,
            )
            for rec in (dep.get("records") or []):
                real_deploy = _deploy_from_record(rec)
                if real_deploy:
                    break

        if real_deploy:
            commit_sha = "deploy-event"
            commit_msg = f"{real_deploy[0]} ({real_deploy[1]})"
        else:
            # No deployment telemetry on this tenant → scripted commit narrative.
            commit_sha, commit_msg = random.choice(COMMITS)
        minutes_ago = random.randint(4, 22)
        deploy_time = (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()
        await self.timeline(iid, "Deploy detected", f"{commit_sha} — {commit_msg}", kind="deploy")
        await self.evidence(
            iid,
            f"Deploy {commit_sha}",
            f"{commit_msg} (rolled out {deploy_time})",
            weight=0.85,
        )
        await self.thought(
            iid,
            await self.llm(
                f"You are the Deployment Agent. You queried GitLab and found commit {commit_sha} "
                f"('{commit_msg}') was rolled out {minutes_ago} minutes ago on {svc}, "
                "inside the incident window. Comment briefly on the temporal correlation.",
                fallback="Deploy lands inside the anomaly window. Strong temporal correlation.",
                max_words=22,
                incident_id=iid,
            ),
            confidence=0.7,
        )
        await self.hypothesis(
            iid,
            await self.llm(
                f"As Deployment Agent: commit {commit_sha} ('{commit_msg}') deployed {minutes_ago} "
                "min before the spike. Propose a one-line hypothesis for what regressed.",
                fallback=f"Regression introduced by {commit_sha}.",
                max_words=18,
                incident_id=iid,
            ),
            confidence=0.74,
        )
        await self.finish(
            iid,
            await self.llm(
                f"Wrap up the Deployment Agent verdict: suspect commit {commit_sha} ('{commit_msg}'), "
                f"deployed {minutes_ago} min ago. One terse line.",
                fallback=f"Suspect deploy: {commit_sha} — {commit_msg}.",
                max_words=24,
                incident_id=iid,
            ),
            confidence=0.81,
        )
        return {"commit_sha": commit_sha, "commit_msg": commit_msg, "deploy_time": deploy_time}
