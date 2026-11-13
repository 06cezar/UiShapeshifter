// Pornește și oprește rulările. O rulare nouă a aceluiași utilizator o oprește pe cea veche; una pornită de
// adaptare (E3) nu întrerupe omul: așteaptă la coadă până se termină rularea curentă (specs/05).

import { randomUUID } from "node:crypto";
import type { AgentRun, RunOrigin } from "@uishapeshifter/contracts";
import { saveRun } from "../runs/run-store";
import { abandonCallsOfRun, callWebTool, latestSessionOf, sendToSession, type Session } from "../ws/sessions";
import { createFakeDecider } from "./fake-decider";
import { runAgent, type Decider } from "./run-agent";
import { callServerTool } from "./server-tools";

// pauza dintre pașii agentului fals, ca pașii să apară în panou unul câte unul
const FAKE_STEP_DELAY_MS = Number(process.env.AGENT_FAKE_DELAY_MS ?? 600);

interface ActiveRun {
  runId: string;
  cancelled: boolean;
  done: Promise<AgentRun>;
}

const activeByUser = new Map<string, ActiveRun>();
const queuedAdaptation = new Map<string, { goal: string; origin: RunOrigin }>();

function createDecider(goal: string): Decider {
  if (process.env.AGENT_FAKE !== "1") {
    // bucla cu OpenRouter vine în A2; până atunci, fără AGENT_FAKE=1 folosim tot agentul fals
    console.warn("agent: AGENT_FAKE nu e 1, dar agentul real nu e încă legat; folosesc agentul fals");
  }
  return createFakeDecider(goal, FAKE_STEP_DELAY_MS);
}

function newRunId(): string {
  return `run-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function launch(session: Session, goal: string, origin: RunOrigin): ActiveRun {
  const decider = createDecider(goal);
  const run: AgentRun = {
    runId: newRunId(),
    userId: session.userId,
    origin,
    goal,
    startedAt: new Date().toISOString(),
    status: "running",
    steps: [],
    model: decider.model,
  };
  const active: ActiveRun = { runId: run.runId, cancelled: false, done: Promise.resolve(run) };
  sendToSession(session, { type: "run_started", runId: run.runId, goal, origin });

  active.done = runAgent(run, decider, {
    callWebTool: (name, args) => callWebTool(session, run.runId, name, args),
    callServerTool: async (name, args) => callServerTool(run.runId, name, args),
    send: (message) => sendToSession(session, message),
    saveRun,
    isCancelled: () => active.cancelled,
  }).finally(() => {
    if (activeByUser.get(session.userId) === active) activeByUser.delete(session.userId);
    const next = queuedAdaptation.get(session.userId);
    if (next && !activeByUser.has(session.userId)) {
      queuedAdaptation.delete(session.userId);
      startRun(session.userId, next.goal, next.origin);
    }
  });
  activeByUser.set(session.userId, active);
  return active;
}

function stop(active: ActiveRun): void {
  active.cancelled = true;
  abandonCallsOfRun(active.runId); // nu mai așteptăm unealta în zbor (ex. un click care nu vine)
}

/** Rularea cerută din sesiunea în care a scris omul. */
export function startRunInSession(session: Session, goal: string, origin: RunOrigin = "user"): string {
  const current = activeByUser.get(session.userId);
  if (current) stop(current);
  return launch(session, goal, origin).runId;
}

/**
 * Pornește o rulare pentru un utilizator, în tab-ul lui conectat cel mai recent.
 * Pentru E3 (adaptare) și C3 (onboarding). Întoarce runId, „queued” dacă așteaptă la coadă,
 * sau null dacă utilizatorul nu are niciun tab deschis.
 */
export function startRun(userId: string, goal: string, origin: RunOrigin): string | "queued" | null {
  const session = latestSessionOf(userId);
  if (!session) return null;
  if (origin === "adaptation" && activeByUser.has(userId)) {
    queuedAdaptation.set(userId, { goal, origin }); // cel mai nou declanșator îl înlocuiește pe cel vechi
    return "queued";
  }
  return startRunInSession(session, goal, origin);
}

/** cancel_run: bucla se oprește după pasul curent și trimite run_finished { success: false }. */
export function cancelRun(userId: string, runId: string): boolean {
  const active = activeByUser.get(userId);
  if (!active || active.runId !== runId) return false;
  stop(active);
  return true;
}

/** Pentru teste: așteaptă rularea activă a unui utilizator. */
export function activeRunOf(userId: string): Promise<AgentRun> | null {
  return activeByUser.get(userId)?.done ?? null;
}
