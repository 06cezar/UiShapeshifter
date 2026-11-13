// Pornește și oprește rulările. O rulare nouă a aceluiași utilizator o oprește pe cea veche; una pornită de
// adaptare (E3) nu întrerupe omul: așteaptă la coadă până se termină rularea curentă (specs/05).

import { randomUUID } from "node:crypto";
import type { AgentRun, PageInfo, RunOrigin, SiteToolStage } from "@uishapeshifter/contracts";
import { saveRun } from "../runs/run-store";
import { abandonCallsOfRun, callWebTool, latestSessionOf, sendToSession, type Session } from "../ws/sessions";
import { createFakeDecider } from "./fake-decider";
import { createOpenRouterDecider } from "./openrouter-decider";
import { runAgent, type Decider } from "./run-agent";
import { profileStore, profileSummary } from "../profile";
import { callServerTool } from "./server-tools";
import type { ProfileContext } from "./system-prompt";

// pauza dintre pașii agentului fals, ca pașii să apară în panou unul câte unul
const FAKE_STEP_DELAY_MS = Number(process.env.AGENT_FAKE_DELAY_MS ?? 600);

interface ActiveRun {
  runId: string;
  cancelled: boolean;
  replaced: boolean; // oprită de o rulare nouă a aceluiași om, nu de „Oprește”
  done: Promise<AgentRun>;
}

const activeByUser = new Map<string, ActiveRun>();
const queuedAdaptation = new Map<string, { goal: string; origin: RunOrigin }>();

// etapa la care e extensia (specs/00), citită la fiecare rulare. Implicit 1, singura cu toate uneltele în extensie
// acum (get_page_snapshot, apply_css, say); etapa 2 se pornește cu AGENT_STAGE=2 după M2, când extensia are și
// apply_ops, point_at, ask_user, propose_changes. Altfel modelul cere unelte pe care pagina le refuză.
const DEFAULT_STAGE: SiteToolStage = 1;

export function agentStage(): SiteToolStage {
  const stage = Number(process.env.AGENT_STAGE);
  return stage === 1 || stage === 2 || stage === 3 ? stage : DEFAULT_STAGE;
}

/** Ce știe agentul despre om (etapa 3): rezumatul profilului și preferințele generale, din store-ul lui E. */
async function profileContext(userId: string): Promise<ProfileContext> {
  const profile = await profileStore.get(userId);
  return { summary: profileSummary(profile), generalPreferences: profile.generalPreferences ?? [] };
}

function createDecider(userId: string, goal: string, page: PageInfo | undefined): Decider {
  const stage = agentStage();
  if (process.env.AGENT_FAKE === "1") return createFakeDecider(goal, FAKE_STEP_DELAY_MS, stage);
  return createOpenRouterDecider(goal, {
    page,
    stage,
    ...(stage >= 3 && { loadProfile: () => profileContext(userId) }),
  });
}

function newRunId(): string {
  return `run-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function launch(session: Session, goal: string, origin: RunOrigin, page?: PageInfo): ActiveRun {
  const decider = createDecider(session.userId, goal, page);
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
  const active: ActiveRun = { runId: run.runId, cancelled: false, replaced: false, done: Promise.resolve(run) };
  sendToSession(session, { type: "run_started", runId: run.runId, goal, origin });

  active.done = runAgent(run, decider, {
    callWebTool: (name, args) => callWebTool(session, run.runId, name, args),
    callServerTool: (name, args) => callServerTool(run.runId, session.userId, name, args),
    send: (message) => sendToSession(session, message),
    saveRun,
    isCancelled: () => active.cancelled,
    isReplaced: () => active.replaced,
  })
    // o eroare scăpată din buclă nu trebuie să oprească tot serverul
    .catch((error: unknown) => {
      console.error(`agent: rularea ${run.runId} s-a oprit cu o eroare neprinsă:`, error);
      return run;
    })
    .finally(() => {
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
/** `page`: site-ul de pe care a scris omul (extensia); lipsește pe pagina de probă și la rulările pornite de server. */
export function startRunInSession(session: Session, goal: string, origin: RunOrigin = "user", page?: PageInfo): string {
  const current = activeByUser.get(session.userId);
  if (current) {
    current.replaced = true;
    stop(current);
  }
  return launch(session, goal, origin, page).runId;
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
