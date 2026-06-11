"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { getIncidentEvents, listIncidents } from "./api";
import type {
  AgentName,
  AgentTokenEvent,
  BusinessImpactEvent,
  CrisisEvent,
  Incident,
  IncidentDetectedEvent,
  IncidentStatusEvent,
  RemediationProposedEvent,
} from "./types";

type ReplayState = {
  active: boolean;
  incidentId: string | null;
  /** Virtual time within the incident, ms since detected_at. */
  cursorMs: number;
  /** Total duration of the incident (last_event.ts - detected_at), ms. */
  durationMs: number;
  isPlaying: boolean;
  /** Playback speed multiplier. */
  speed: number;
};

type State = {
  incidents: Record<string, Incident>;
  order: string[];
  selectedId: string | null;
  wsStatus: "connecting" | "open" | "closed";
  replay: ReplayState;
};

type Action =
  | { type: "event"; event: CrisisEvent }
  | { type: "select"; id: string }
  | { type: "ws"; status: State["wsStatus"] }
  | { type: "replay.enter"; id: string; durationMs: number }
  | { type: "replay.exit" }
  | { type: "replay.seek"; cursorMs: number }
  | { type: "replay.tick"; deltaMs: number }
  | { type: "replay.toggle" }
  | { type: "replay.speed"; speed: number };

const initialReplay: ReplayState = {
  active: false,
  incidentId: null,
  cursorMs: 0,
  durationMs: 0,
  isPlaying: false,
  speed: 2,
};

const initialState: State = {
  incidents: {},
  order: [],
  selectedId: null,
  wsStatus: "connecting",
  replay: initialReplay,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ws":
      return { ...state, wsStatus: action.status };
    case "select":
      return { ...state, selectedId: action.id };
    case "replay.enter":
      return {
        ...state,
        selectedId: action.id,
        replay: {
          active: true,
          incidentId: action.id,
          cursorMs: 0,
          durationMs: action.durationMs,
          isPlaying: false,
          speed: state.replay.speed || 2,
        },
      };
    case "replay.exit":
      return { ...state, replay: { ...initialReplay, speed: state.replay.speed } };
    case "replay.seek":
      return {
        ...state,
        replay: {
          ...state.replay,
          cursorMs: Math.max(0, Math.min(action.cursorMs, state.replay.durationMs)),
        },
      };
    case "replay.tick": {
      const next = state.replay.cursorMs + action.deltaMs;
      if (next >= state.replay.durationMs) {
        return {
          ...state,
          replay: { ...state.replay, cursorMs: state.replay.durationMs, isPlaying: false },
        };
      }
      return { ...state, replay: { ...state.replay, cursorMs: next } };
    }
    case "replay.toggle":
      return { ...state, replay: { ...state.replay, isPlaying: !state.replay.isPlaying } };
    case "replay.speed":
      return { ...state, replay: { ...state.replay, speed: action.speed } };
    case "event": {
      const ev = action.event;
      const iid = ev.incident_id;
      const incidents = { ...state.incidents };
      let order = state.order;
      let selectedId = state.selectedId;

      if (ev.type === "incident.detected") {
        const d = ev as IncidentDetectedEvent;
        if (!incidents[iid]) {
          incidents[iid] = {
            id: iid,
            title: d.title,
            severity: d.severity,
            service: d.service,
            region: d.region,
            summary: d.summary,
            status: "detected",
            detected_at: d.ts,
            events: [d],
          };
          order = [iid, ...order];
          if (!selectedId) selectedId = iid;
        }
        return { ...state, incidents, order, selectedId };
      }

      const existing = incidents[iid];
      if (!existing) return state;

      // agent.token streams don't append to events; they accumulate into
      // a per-agent partial text that the UI renders live.
      if (ev.type === "agent.token") {
        const t = ev as AgentTokenEvent;
        const agent = t.agent as AgentName;
        const prev = existing.streaming?.[agent] ?? "";
        const streaming = { ...(existing.streaming ?? {}) };
        if (t.done) {
          delete streaming[agent];
        } else {
          streaming[agent] = prev + t.text;
        }
        incidents[iid] = { ...existing, streaming };
        return { ...state, incidents };
      }

      // Idempotent append: bootstrap replay, StrictMode double-mount, and any
      // WS-server replay buffers can all redeliver the same event. Dedupe by id.
      if (ev.id && existing.events.some((e) => e.id === ev.id)) return state;

      const next: Incident = { ...existing, events: [...existing.events, ev] };

      if (ev.type === "incident.status") {
        next.status = (ev as IncidentStatusEvent).status;
      } else if (ev.type === "impact.update") {
        next.impact = ev as BusinessImpactEvent;
      } else if (ev.type === "remediation.proposed") {
        next.remediation = ev as RemediationProposedEvent;
      } else if (
        ev.type === "agent.thought" ||
        ev.type === "agent.hypothesis" ||
        ev.type === "agent.finished"
      ) {
        // The final event arrived with the complete text — clear the in-progress
        // stream for that agent so the UI swaps to the canonical rendering.
        const agent = (ev as { agent: AgentName }).agent;
        if (next.streaming?.[agent]) {
          const streaming = { ...next.streaming };
          delete streaming[agent];
          next.streaming = streaming;
        }
      }

      incidents[iid] = next;
      return { ...state, incidents };
    }
    default:
      return state;
  }
}

const StoreCtx = createContext<{
  state: State;
  select: (id: string) => void;
  enterReplay: (id: string) => void;
  exitReplay: () => void;
  seekReplay: (cursorMs: number) => void;
  toggleReplay: () => void;
  setReplaySpeed: (speed: number) => void;
} | null>(null);

function incidentDurationMs(inc: Incident): number {
  if (!inc.events.length) return 0;
  const detected = new Date(inc.detected_at).getTime();
  const last = inc.events.reduce((acc, e) => {
    const t = new Date(e.ts).getTime();
    return t > acc ? t : acc;
  }, detected);
  return Math.max(0, last - detected);
}

/** Return the incident as it looked at `cursorMs` after detection. */
function sliceIncidentAt(inc: Incident, cursorMs: number): Incident {
  const detected = new Date(inc.detected_at).getTime();
  const slicedEvents = inc.events.filter(
    (e) => new Date(e.ts).getTime() - detected <= cursorMs,
  );
  let status = "detected" as Incident["status"];
  let impact: Incident["impact"] = undefined;
  let remediation: Incident["remediation"] = undefined;
  for (const ev of slicedEvents) {
    if (ev.type === "incident.status") {
      status = (ev as IncidentStatusEvent).status;
    } else if (ev.type === "impact.update") {
      impact = ev as BusinessImpactEvent;
    } else if (ev.type === "remediation.proposed") {
      remediation = ev as RemediationProposedEvent;
    }
  }
  return {
    ...inc,
    events: slicedEvents,
    status,
    impact,
    remediation,
    streaming: undefined,
  };
}

const WS_URL =
  (typeof window !== "undefined" && (window as any).__CP_WS_URL__) ||
  process.env.NEXT_PUBLIC_BACKEND_WS ||
  "ws://localhost:8000/ws/stream";

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const wsRef = useRef<WebSocket | null>(null);

  // Hydrate from persisted store (MongoDB Atlas in production, in-memory otherwise)
  // before — or in parallel with — the live WebSocket stream. Replaying events
  // through the same reducer that handles live events keeps state-shape logic in one place.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const incidents = await listIncidents();
        if (cancelled) return;
        const eventLists = await Promise.all(
          incidents.map((inc) => getIncidentEvents(inc.id).catch(() => [] as CrisisEvent[])),
        );
        if (cancelled) return;
        // Replay oldest-first so the most recent incident lands on top of `order`.
        // Skip agent.token deltas — they're streaming-only; the canonical
        // thought/hypothesis/finished event in the stream already holds the full text.
        for (const events of [...eventLists].reverse()) {
          for (const ev of events) {
            if (ev.type === "agent.token") continue;
            dispatch({ type: "event", event: ev });
          }
        }
      } catch {
        /* bootstrap is best-effort; live WS will populate as events arrive */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retry = 0;

    const connect = () => {
      if (cancelled) return;
      dispatch({ type: "ws", status: "connecting" });
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        retry = 0;
        dispatch({ type: "ws", status: "open" });
      };
      ws.onmessage = (msg) => {
        try {
          const ev = JSON.parse(msg.data) as CrisisEvent;
          dispatch({ type: "event", event: ev });
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        dispatch({ type: "ws", status: "closed" });
        if (cancelled) return;
        retry = Math.min(retry + 1, 6);
        setTimeout(connect, 500 * 2 ** retry);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, []);

  // Drive the playback cursor forward when replay.isPlaying is true.
  useEffect(() => {
    if (!state.replay.active || !state.replay.isPlaying) return;
    const TICK = 80; // ms; balances smoothness against re-renders
    const id = setInterval(() => {
      dispatch({ type: "replay.tick", deltaMs: TICK * state.replay.speed });
    }, TICK);
    return () => clearInterval(id);
  }, [state.replay.active, state.replay.isPlaying, state.replay.speed]);

  const value = useMemo(
    () => ({
      state,
      select: (id: string) => dispatch({ type: "select", id }),
      enterReplay: (id: string) => {
        const inc = state.incidents[id];
        if (!inc) return;
        dispatch({ type: "replay.enter", id, durationMs: incidentDurationMs(inc) });
      },
      exitReplay: () => dispatch({ type: "replay.exit" }),
      seekReplay: (cursorMs: number) => dispatch({ type: "replay.seek", cursorMs }),
      toggleReplay: () => dispatch({ type: "replay.toggle" }),
      setReplaySpeed: (speed: number) => dispatch({ type: "replay.speed", speed }),
    }),
    [state],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

export function useSelectedIncident(): Incident | null {
  const { state } = useStore();
  if (!state.selectedId) return null;
  const inc = state.incidents[state.selectedId];
  if (!inc) return null;
  if (state.replay.active && state.replay.incidentId === inc.id) {
    return sliceIncidentAt(inc, state.replay.cursorMs);
  }
  return inc;
}

export function useReplay() {
  const ctx = useStore();
  return {
    ...ctx.state.replay,
    enter: ctx.enterReplay,
    exit: ctx.exitReplay,
    seek: ctx.seekReplay,
    toggle: ctx.toggleReplay,
    setSpeed: ctx.setReplaySpeed,
  };
}
