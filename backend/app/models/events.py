"""Event schema. Everything that flows over the WebSocket is one of these."""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id() -> str:
    return uuid4().hex[:12]


class Severity(str, Enum):
    SEV1 = "SEV1"
    SEV2 = "SEV2"
    SEV3 = "SEV3"
    SEV4 = "SEV4"


class IncidentStatus(str, Enum):
    DETECTED = "detected"
    INVESTIGATING = "investigating"
    IDENTIFIED = "identified"
    MITIGATING = "mitigating"
    RESOLVED = "resolved"


class AgentName(str, Enum):
    ROOT_CAUSE = "RootCauseAgent"
    METRICS = "MetricsAgent"
    DEPLOYMENT = "DeploymentAgent"
    TIMELINE = "TimelineAgent"
    BUSINESS_IMPACT = "BusinessImpactAgent"
    COMMS = "CommsAgent"


class BaseEvent(BaseModel):
    id: str = Field(default_factory=_id)
    ts: str = Field(default_factory=_now)
    type: str
    incident_id: str


class IncidentDetectedEvent(BaseEvent):
    type: Literal["incident.detected"] = "incident.detected"
    title: str
    severity: Severity
    service: str
    region: str
    summary: str


class IncidentStatusEvent(BaseEvent):
    type: Literal["incident.status"] = "incident.status"
    status: IncidentStatus


class AgentStartEvent(BaseEvent):
    type: Literal["agent.start"] = "agent.start"
    agent: AgentName
    objective: str


class AgentThoughtEvent(BaseEvent):
    type: Literal["agent.thought"] = "agent.thought"
    agent: AgentName
    thought: str
    confidence: float = 0.0


class AgentToolCallEvent(BaseEvent):
    type: Literal["agent.tool_call"] = "agent.tool_call"
    agent: AgentName
    tool: str
    args: dict[str, Any] = {}


class AgentEvidenceEvent(BaseEvent):
    type: Literal["agent.evidence"] = "agent.evidence"
    agent: AgentName
    label: str
    detail: str
    weight: float = 0.5


class AgentHypothesisEvent(BaseEvent):
    type: Literal["agent.hypothesis"] = "agent.hypothesis"
    agent: AgentName
    hypothesis: str
    confidence: float


class AgentFinishedEvent(BaseEvent):
    type: Literal["agent.finished"] = "agent.finished"
    agent: AgentName
    conclusion: str
    confidence: float


class AgentTokenEvent(BaseEvent):
    """Incremental LLM chunk streamed live. `text` is the delta; `done` flags the
    final chunk for this `stream_id`. The full assembled text is also re-emitted
    as the matching agent.thought / agent.hypothesis / agent.finished event."""
    type: Literal["agent.token"] = "agent.token"
    agent: AgentName
    stream_id: str
    text: str = ""
    done: bool = False


class BusinessImpactEvent(BaseEvent):
    type: Literal["impact.update"] = "impact.update"
    revenue_loss_usd_per_minute: float
    customers_affected: int
    sla_breach_probability: float
    reputational_risk: Literal["low", "moderate", "high", "severe"]


class RemediationProposedEvent(BaseEvent):
    type: Literal["remediation.proposed"] = "remediation.proposed"
    action: str
    rationale: str
    requires_approval: bool = True
    confidence: float


class TimelineEntryEvent(BaseEvent):
    type: Literal["timeline.entry"] = "timeline.entry"
    label: str
    detail: str
    kind: Literal["deploy", "alert", "agent", "user", "metric"] = "agent"


CrisisEvent = (
    IncidentDetectedEvent
    | IncidentStatusEvent
    | AgentStartEvent
    | AgentThoughtEvent
    | AgentToolCallEvent
    | AgentEvidenceEvent
    | AgentHypothesisEvent
    | AgentFinishedEvent
    | AgentTokenEvent
    | BusinessImpactEvent
    | RemediationProposedEvent
    | TimelineEntryEvent
)
