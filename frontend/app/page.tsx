"use client";

import { StoreProvider, useSelectedIncident } from "@/lib/store";
import { CommandBar } from "@/components/CommandBar";
import { IncidentList } from "@/components/IncidentList";
import { IncidentHeader } from "@/components/IncidentHeader";
import { AgentStream } from "@/components/AgentStream";
import { ReasoningGraph } from "@/components/ReasoningGraph";
import { ReplayControls } from "@/components/ReplayControls";
import { Timeline } from "@/components/Timeline";
import { BusinessImpactCard } from "@/components/BusinessImpactCard";
import { ConfidenceEvolution } from "@/components/ConfidenceEvolution";
import { DebatePanel } from "@/components/DebatePanel";
import { RemediationCard } from "@/components/RemediationCard";
import { UploadDropzone } from "@/components/UploadDropzone";

function EmptyState() {
  return (
    <div className="glass-strong flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <div className="text-xs uppercase tracking-[0.18em] text-white/40">
        CrisisPilot is listening
      </div>
      <div className="text-lg font-semibold text-white/80">
        No incident selected.
      </div>
      <div className="max-w-md text-sm text-white/50">
        Drop telemetry into the ingestion panel or trigger a synthetic incident to
        watch the agents investigate in real time.
      </div>
    </div>
  );
}

function Dashboard() {
  const incident = useSelectedIncident();

  return (
    <div className="relative">
      <div className="grid-backdrop pointer-events-none fixed inset-0 -z-10" />
      <CommandBar />
      <main className="mx-auto max-w-[1600px] px-6 py-5">
        <div className="grid h-[calc(100vh-104px)] grid-cols-12 gap-4">
          <div className="col-span-3">
            <IncidentList />
          </div>

          <section className="col-span-6 flex flex-col gap-4 overflow-hidden">
            {incident ? (
              <>
                <IncidentHeader incident={incident} />
                <ReplayControls />
                <ReasoningGraph incident={incident} />
                <div className="min-h-0 flex-1">
                  <AgentStream incident={incident} />
                </div>
              </>
            ) : (
              <EmptyState />
            )}
          </section>

          <aside className="col-span-3 flex flex-col gap-4 overflow-y-auto scrollbar-thin pr-1">
            {incident && <ConfidenceEvolution incident={incident} />}
            {incident && <DebatePanel incident={incident} />}
            {incident && <BusinessImpactCard incident={incident} />}
            {incident && <RemediationCard incident={incident} />}
            {incident && <Timeline incident={incident} />}
            <UploadDropzone />
          </aside>
        </div>
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <StoreProvider>
      <Dashboard />
    </StoreProvider>
  );
}
