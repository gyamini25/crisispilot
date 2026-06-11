export type Severity = "SEV1" | "SEV2" | "SEV3" | "SEV4";
export type IncidentStatus =
  | "detected"
  | "investigating"
  | "identified"
  | "mitigating"
  | "resolved";

export type AgentName =
  | "RootCauseAgent"
  | "MetricsAgent"
  | "DeploymentAgent"
  | "TimelineAgent"
  | "BusinessImpactAgent"
  | "CommsAgent";

export interface BaseEvent {
  id: string;
  ts: string;
  type: string;
  incident_id: string;
}

export interface IncidentDetectedEvent extends BaseEvent {
  type: "incident.detected";
  title: string;
  severity: Severity;
  service: string;
  region: string;
  summary: string;
}

export interface IncidentStatusEvent extends BaseEvent {
  type: "incident.status";
  status: IncidentStatus;
}

export interface AgentStartEvent extends BaseEvent {
  type: "agent.start";
  agent: AgentName;
  objective: string;
}

export interface AgentThoughtEvent extends BaseEvent {
  type: "agent.thought";
  agent: AgentName;
  thought: string;
  confidence: number;
}

export interface AgentToolCallEvent extends BaseEvent {
  type: "agent.tool_call";
  agent: AgentName;
  tool: string;
  args: Record<string, unknown>;
}

export interface AgentEvidenceEvent extends BaseEvent {
  type: "agent.evidence";
  agent: AgentName;
  label: string;
  detail: string;
  weight: number;
}

export interface AgentHypothesisEvent extends BaseEvent {
  type: "agent.hypothesis";
  agent: AgentName;
  hypothesis: string;
  confidence: number;
}

export interface AgentFinishedEvent extends BaseEvent {
  type: "agent.finished";
  agent: AgentName;
  conclusion: string;
  confidence: number;
}

export interface AgentTokenEvent extends BaseEvent {
  type: "agent.token";
  agent: AgentName;
  stream_id: string;
  text: string;
  done: boolean;
}

export interface BusinessImpactEvent extends BaseEvent {
  type: "impact.update";
  revenue_loss_usd_per_minute: number;
  customers_affected: number;
  sla_breach_probability: number;
  reputational_risk: "low" | "moderate" | "high" | "severe";
}

export interface RemediationProposedEvent extends BaseEvent {
  type: "remediation.proposed";
  action: string;
  rationale: string;
  requires_approval: boolean;
  confidence: number;
}

export interface TimelineEntryEvent extends BaseEvent {
  type: "timeline.entry";
  label: string;
  detail: string;
  kind: "deploy" | "alert" | "agent" | "user" | "metric";
}

export type CrisisEvent =
  | IncidentDetectedEvent
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
  | TimelineEntryEvent;

export interface Incident {
  id: string;
  title: string;
  severity: Severity;
  service: string;
  region: string;
  summary: string;
  status: IncidentStatus;
  detected_at: string;
  source?: string;
  filename?: string;
  events: CrisisEvent[];
  impact?: BusinessImpactEvent;
  remediation?: RemediationProposedEvent;
  /** Currently-streaming partial LLM text per agent. Cleared when the matching
   *  final thought/hypothesis/finished event arrives, or when token.done=true. */
  streaming?: Partial<Record<AgentName, string>>;
}
