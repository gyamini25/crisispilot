from __future__ import annotations

import random
from typing import Any

from app.agents.base import Agent
from app.models.events import AgentName


class MetricsAgent(Agent):
    name = AgentName.METRICS
    objective = "Correlate telemetry spikes with the incident window."

    async def run(self, incident: dict[str, Any]) -> dict[str, Any]:
        iid = incident["id"]
        svc = incident["service"]
        region = incident["region"]
        anomaly = incident.get("anomaly")

        await self.start(iid)
        await self._pause()

        if anomaly:
            # We're investigating a real anomaly detected in uploaded telemetry.
            # Reuse the parsed values rather than generating random ones.
            metric_name = anomaly["column"]
            peak = float(anomaly["peak_value"])
            baseline = float(anomaly["baseline_median"])
            z = float(anomaly["z_score"])
            direction = anomaly.get("direction", "high")
            samples = anomaly["sample_count"]

            await self.tool_call(
                iid,
                "telemetry.query",
                metric=metric_name,
                service=svc,
                samples=samples,
            )
            await self._pause()
            await self.evidence(
                iid,
                f"{metric_name} {'spike' if direction == 'high' else 'collapse'}",
                f"peak {peak:g} vs baseline {baseline:g} "
                f"({z:.1f}σ across {samples} samples)",
                weight=min(0.95, 0.55 + z / 20),
            )
            await self.thought(
                iid,
                await self.llm(
                    f"You are the Metrics Agent. The uploaded telemetry shows {metric_name} "
                    f"{'spiking to' if direction == 'high' else 'dropping to'} {peak:g} on {svc} "
                    f"in {region}, versus a median baseline of {baseline:g} ({z:.1f}σ). "
                    "Comment on the severity and what this suggests.",
                    fallback=(
                        f"{metric_name} {'climbed to' if direction == 'high' else 'fell to'} "
                        f"{peak:g} — {z:.1f}σ off baseline {baseline:g}."
                    ),
                    max_words=24,
                    incident_id=iid,
                ),
                confidence=min(0.85, 0.45 + z / 15),
            )

            await self._pause()
            await self.hypothesis(
                iid,
                await self.llm(
                    f"As Metrics Agent: {metric_name} on {svc} hit {z:.1f}σ above baseline. "
                    "Propose the most likely upstream cause in one short hypothesis.",
                    fallback="Downstream dependency saturation likely.",
                    max_words=18,
                    incident_id=iid,
                ),
                confidence=min(0.85, 0.5 + z / 18),
            )
            await self.finish(
                iid,
                await self.llm(
                    f"Wrap up the Metrics Agent investigation of {metric_name}={peak:g} "
                    f"(baseline {baseline:g}, {z:.1f}σ). One terse line for the war-room.",
                    fallback=(
                        f"Telemetry confirms anomaly: {metric_name} {peak:g} vs baseline {baseline:g} "
                        f"({z:.1f}σ)."
                    ),
                    max_words=24,
                    incident_id=iid,
                ),
                confidence=min(0.92, 0.7 + z / 25),
            )
            # Expose to downstream agents so they don't synthesize different numbers.
            # Only include p99/error_rate keys when the detected metric matches —
            # downstream agents pull these to format their reasoning.
            result: dict[str, Any] = {
                "metric_name": metric_name,
                "metric_peak": peak,
                "metric_baseline": baseline,
                "metric_z": z,
            }
            lname = metric_name.lower()
            if "p99" in lname or "latency" in lname:
                result["p99"] = peak
            if "error" in lname or "err_rate" in lname:
                result["error_rate"] = peak
            return result

        # No anomaly attached → simulated incident path (original behavior).
        dt = await self.tool_call(iid, "dynatrace.query", metric="latency_p99", service=svc)
        if dt and dt.get("rows"):
            await self.evidence(
                iid,
                "Dynatrace (live via MCP)",
                f"{dt['rows']} service timeseries returned from Grail",
                weight=0.6,
            )
        await self._pause()
        p99 = random.uniform(2.4, 6.8)
        await self.evidence(
            iid,
            "latency_p99 spike",
            f"{p99:.2f}s on {svc} ({region})",
            weight=0.7,
        )
        await self.thought(
            iid,
            await self.llm(
                f"You are the Metrics Agent. You just queried Dynatrace and found p99 latency on "
                f"{svc} in {region} climbed to {p99:.2f}s versus a 800ms baseline. "
                f"Comment on the severity and what this suggests.",
                fallback=f"p99 latency climbed {p99:.2f}s — far above 800ms baseline.",
                max_words=22,
                incident_id=iid,
            ),
            confidence=0.55,
        )
        await self._pause()
        await self.tool_call(iid, "dynatrace.query", metric="error_rate", service=svc)
        await self._pause()
        err = random.uniform(7.0, 23.0)
        await self.evidence(
            iid,
            "error_rate",
            f"{err:.1f}% (baseline 0.4%)",
            weight=0.8,
        )
        await self.hypothesis(
            iid,
            await self.llm(
                f"As Metrics Agent on a SEV incident: error rate is {err:.1f}% (baseline 0.4%) and "
                f"p99 is {p99:.2f}s on {svc}. Propose the most likely upstream cause in one short hypothesis.",
                fallback="Downstream dependency saturation likely.",
                max_words=18,
                incident_id=iid,
            ),
            confidence=0.62,
        )
        await self.finish(
            iid,
            await self.llm(
                f"You are wrapping up the Metrics Agent investigation: p99={p99:.2f}s, error_rate={err:.1f}%. "
                "Summarize your finding in one terse line for the war-room.",
                fallback=f"Telemetry confirms anomaly: p99 {p99:.2f}s, error rate {err:.1f}%.",
                max_words=22,
                incident_id=iid,
            ),
            confidence=0.78,
        )
        return {"p99": p99, "error_rate": err}
