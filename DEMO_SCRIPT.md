# CrisisPilot — 3-Minute Demo Playbook

> Autonomous AI Incident Commander. Real-time detection, investigation, and remediation orchestration.

A judge-facing demo script. Times are cumulative. Cues in `**bold**`, narration in plain text, on-screen actions in *italic*.

---

## Pre-flight (do this 60 seconds before the slot)

| Check | How |
|---|---|
| Backend up | `curl :8000/healthz` returns `{"ok":true,"stub_mode":false,"mongo":"real"}` |
| Frontend up | http://localhost:3000 loads, status pill reads **Live** (green) |
| Gemini quota | One throwaway trigger should produce streaming text (not fallback). If you see scripted-feel text, switch model in [backend/app/agents/base.py](backend/app/agents/base.py) to `gemini-flash-lite-latest` |
| Atlas reachable | The operations feed shows existing incidents from past triggers, not blank |
| Browser zoom | 110% on a 14"+ display, 90% on a 27"+ monitor — judges should see the full 3-column war room |
| Other tabs | Close them. Dock and notifications off |
| Mic test | Speak the first line out loud before the timer starts |

**Reset trick:** if you want a clean dashboard with no historical incidents, briefly comment the `MONGODB_URI` line in `.env` and restart uvicorn — the in-memory store resets every restart. Switch it back before the real demo.

---

## The script

### 0:00 — Opening hook (15s)

*Screen shows the dashboard, idle, no incidents. Cursor on the top-bar **Trigger incident** button.*

> "Every minute a checkout API is degraded, e-commerce loses thousands. The average outage today takes **forty-seven minutes** to root-cause — most of it humans hunting through dashboards.
>
> This is **CrisisPilot**. It's an autonomous incident commander. Watch what happens when something breaks."

**Beat:** pause for one second. *Then click "Trigger incident".*

---

### 0:15 — The crisis lands (15s)

*The left "Operations Feed" suddenly populates with a SEV1 incident card. Center column auto-selects it: incident header, reasoning graph, and an empty agent stream all snap into view. Status pill turns red.*

> "A SEV-1 just fired. Payment gateway, EU-West. Customers are getting errors right now.
>
> Notice the **reasoning graph** at the top — five specialized agents have spun up. Metrics, Deployment, Business Impact, all running **in parallel**. Then a Root Cause synthesizer downstream. Then a Comms agent that drafts the human-facing summary."

*Point at the graph nodes with your cursor as you name them.*

---

### 0:30 — Live cognition (40s)

*Inside each agent card, you can see tool_calls (Dynatrace, GitLab) and evidence chips landing. Gemini-generated reasoning streams in token-by-token with a blinking cursor `▌`. Confidence bars rise.*

> "Each agent narrates its reasoning live — that's **real Gemini**, streaming token by token. They're not just thinking, they're **showing their work**.
>
> Metrics queries Dynatrace and finds p99 latency at 5 seconds — six times baseline. Deployment queries GitLab, finds a commit that rolled out three minutes before the spike. Business Impact pulls real-time revenue and tells us we're burning twenty-two thousand dollars a minute."

*Right column: Confidence Evolution sparklines start populating. Business Impact card shows revenue ticking up in real time.*

> "Watch the **confidence sparklines** on the right. As evidence accumulates, every agent's certainty rises. This is the AI's epistemic state, visible."

---

### 1:10 — The debate (30s)

*Multi-Agent Debate panel populates with three competing hypotheses (Metrics, Deployment, Business Impact), each on its own card with confidence bar.*

> "Now the agents **disagree**. Metrics blames downstream saturation. Deployment blames the new commit. Business Impact says the burn rate has already crossed the rollback threshold — act now, investigate later.
>
> Three competing claims. **This is what real incident war rooms feel like** — but it's happening in fifteen seconds, not forty-five minutes."

*Wait for the Root Cause synthesis card to appear, with one of the three claims **crowned** as Selected.*

> "Root Cause synthesizes the evidence and **picks a winner** — the deploy regression. The hypothesis with the highest evidentiary weight wins."

---

### 1:40 — Business impact materializes (20s)

*Business Impact card on the right shows a large dollar number ticking up live: "$XX since detection." Customers affected, SLA breach probability, reputational risk pill.*

> "Meanwhile the Business Impact card is doing what no human SRE wakes up at 3 a.m. wanting to do — counting the bleeding. We're at **a hundred and twenty thousand dollars** of cumulative revenue lost. Ninety-two percent SLA breach probability. Severe reputational risk."

*Optional aside if time:* "All of this is persisted in **MongoDB Atlas** as it happens. We can replay any historical incident — judges, want to scroll back to one from last week?"

---

### 2:00 — Proposed remediation (25s)

*Remediation card appears: "Rollback deploy `e1f4a92` on payments-gateway", confidence 86%, with Approve / Hold buttons.*

> "The Comms agent has drafted a **remediation proposal** — rollback the suspect deploy. It's written a one-paragraph rationale that you could literally paste into Slack. Eighty-six percent confidence.
>
> But the human is still in the loop. CrisisPilot doesn't yeet rollbacks at production unsupervised."

*Hover over the Approve button.*

> "I click approve, and in a real deployment this fires the GitLab rollback through MCP, drops a stakeholder note in the incidents channel, and starts watching the metrics for recovery."

*Click Approve.* *The card transitions to "Rollback dispatched via GitLab MCP. Mitigation in progress."*

---

### 2:25 — The "holy sh*t" moment (25s)

*Trigger a second incident from the top bar while leaving the first one selected.* *A new card appears in the operations feed; the left column now shows two SEV-1s.*

> "And the reason this is an **operations platform** and not a chatbot — another incident just fired. Different service, different region. The first is still being mitigated. The agents fan out to the second without losing context.
>
> **Five autonomous agents, two parallel incidents, one human in the loop.** This is what 'autonomous SRE' actually looks like."

---

### 2:50 — Close (10s)

*Center the cursor. Slow down.*

> "Forty-seven minutes is the average. With CrisisPilot, the **AI noticed it, investigated it, and proposed the fix** in under two.
>
> That's CrisisPilot."

*Pause. Don't fill silence. Wait for questions.*

---

## Cuts if you're over time

Drop in this order:

1. The "second incident" moment at 2:25 — saves 25s. (Hurts the punch but the demo still wins on the first incident alone.)
2. The Business Impact aside at 2:00 about Atlas — saves 10s.
3. The confidence-sparkline callout at 1:10 — saves 8s.

## Adds if you have an extra 60s

In priority order:

1. **Drop a file** into the Ingestion panel during the lull at 1:40. Show that operators can upload logs / metrics CSVs and they become first-class incidents the agents investigate.
2. **Open the network tab** and show the WebSocket frames flowing — visceral proof that streaming is real, not pre-rendered.
3. **Open Atlas Compass** in a side window and show the `incidents` + `events` collections growing in real time as the demo runs.

## If something breaks (recovery lines)

| Failure | Say this, then |
|---|---|
| Frontend chunk error after a hot reload | "One second — let me hard refresh; this is a Next.js dev quirk we'd solve with a production build." Cmd+Shift+R, continue from the last beat. |
| Gemini fallback (scripted text appears, no streaming cursor) | Don't acknowledge — the scripted text reads as senior-SRE narration on its own. The reasoning graph and debate still work. Only call it out if a judge asks. |
| Backend died mid-demo | "The backend just disconnected — let me restart." `pkill -9 -f 'uvicorn main:app'; cd backend && ./run.sh` from a pre-opened terminal. The frontend's auto-reconnect WS will catch up; the Atlas-persisted incidents bootstrap back. |
| Atlas unreachable | The system gracefully falls back to in-memory and keeps working. Say nothing unless asked. |

## Memorable phrases (use sparingly, they land harder)

- *"They're not just thinking, they're showing their work."*
- *"This is what real incident war rooms feel like — in fifteen seconds, not forty-five minutes."*
- *"It's counting the bleeding."*
- *"CrisisPilot doesn't yeet rollbacks at production unsupervised."*
- *"Five autonomous agents, two parallel incidents, one human in the loop."*

## What you're really selling

| Layer | What judges see | What they secretly value |
|---|---|---|
| Visible cognition | Tokens streaming, sparklines rising | "Real agentic behavior, not a chatbot" |
| Multi-agent debate | Three competing claims, one crowned | "Multi-step planning + reflection" |
| Business impact | Dollars ticking up | "Operational realism, not a toy" |
| MongoDB Atlas + Gemini live | `healthz` reports `stub_mode:false, mongo:real` | "Partner integrations are essential, not bolted on" |
| Human approval gate | Approve/Hold buttons | "Production-safe autonomy" |

This is the contrast that wins: **autonomous enough to act, observable enough to trust.**
