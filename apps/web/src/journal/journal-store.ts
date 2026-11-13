// Starea panoului de control (specs/11, „Panoul de control”): rulările văzute live din mesajele serverului,
// propunerea care așteaptă „Păstrez / Anulez” și reluarea pas cu pas a unei rulări terminate.
// Store-ul nu știe de socket: cine ține WebSocket-ul îi dă mesajele prin `handleServerMessage`.

import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import type { AgentRun, AgentStep, RunOrigin, ServerMessage } from "@uishapeshifter/contracts";

export type RunStatus = AgentRun["status"];

/** O rulare așa cum o vede panoul: începe la `run_started`, crește cu fiecare `step`. */
export interface RunView {
  runId: string;
  goal: string;
  origin: RunOrigin;
  status: RunStatus;
  summary?: string;
  steps: AgentStep[];
}

export type ProposalDecision = "keep" | "undo";

/** Propunerea deja aplicată ca previzualizare; omul alege dacă o păstrează. */
export interface PendingProposal {
  proposalId: string;
  title: string;
  summary: string;
  /** Revizia de dinainte de previzualizare: „Anulez” revine aici. */
  revisionBefore: number;
}

export interface ReplayState {
  run: AgentRun;
  index: number;
}

export interface JournalState {
  /** Cele mai noi la final. */
  runs: RunView[];
  /** Rulări pentru care s-a cerut oprirea; `run_finished { success: false }` le marchează „cancelled”. */
  cancelRequested: string[];
  proposal: PendingProposal | null;
  replay: ReplayState | null;

  handleServerMessage(message: ServerMessage): void;
  markCancelRequested(runId: string): void;
  /** Chemată de executorul uneltei `propose_changes`; se rezolvă când omul apasă „Păstrez” sau „Anulez”. */
  requestProposalDecision(proposal: PendingProposal): Promise<ProposalDecision>;
  decideProposal(decision: ProposalDecision): void;
  startReplay(run: AgentRun): void;
  replayTo(index: number): void;
  stopReplay(): void;
}

export type JournalStore = StoreApi<JournalState>;

/** Cele mai vechi rulări ies din panou; reluarea le citește oricum de pe server. */
const MAX_RUNS_KEPT = 20;

export function createJournalStore(): JournalStore {
  // Promisiunea nu e date de afișat, deci nu stă în stare.
  let resolveProposal: ((decision: ProposalDecision) => void) | null = null;

  return createStore<JournalState>()((set, get) => {
    function updateRun(runId: string, change: (run: RunView) => RunView) {
      set((s) => ({ runs: s.runs.map((r) => (r.runId === runId ? change(r) : r)) }));
    }

    return {
      runs: [],
      cancelRequested: [],
      proposal: null,
      replay: null,

      handleServerMessage(message) {
        switch (message.type) {
          case "run_started": {
            const run: RunView = {
              runId: message.runId,
              goal: message.goal,
              origin: message.origin,
              status: "running",
              steps: [],
            };
            set((s) => ({ runs: [...s.runs.filter((r) => r.runId !== run.runId), run].slice(-MAX_RUNS_KEPT) }));
            return;
          }
          case "step": {
            const { step } = message;
            // Un pas retrimis (reconectare) înlocuiește pasul cu același index, nu se dublează.
            updateRun(step.runId, (r) => ({
              ...r,
              steps: [...r.steps.filter((s) => s.index !== step.index), step].sort((a, b) => a.index - b.index),
            }));
            return;
          }
          case "run_finished": {
            const cancelled = !message.success && get().cancelRequested.includes(message.runId);
            const status: RunStatus = message.success ? "succeeded" : cancelled ? "cancelled" : "failed";
            updateRun(message.runId, (r) => ({ ...r, status, summary: message.summary }));
            set((s) => ({ cancelRequested: s.cancelRequested.filter((id) => id !== message.runId) }));
            return;
          }
          default:
            // tool_call, agent_message și error le folosesc agent-bridge, mascota și chatul.
            return;
        }
      },

      markCancelRequested(runId) {
        if (!get().cancelRequested.includes(runId)) set((s) => ({ cancelRequested: [...s.cancelRequested, runId] }));
      },

      requestProposalDecision(proposal) {
        // O propunere nouă o înlocuiește pe cea veche: cea veche rămâne cum era (păstrată).
        resolveProposal?.("keep");
        set({ proposal });
        return new Promise((resolve) => {
          resolveProposal = resolve;
        });
      },

      decideProposal(decision) {
        const resolve = resolveProposal;
        resolveProposal = null;
        set({ proposal: null });
        resolve?.(decision);
      },

      startReplay(run) {
        set({ replay: { run, index: 0 } });
      },

      replayTo(index) {
        const replay = get().replay;
        if (!replay || replay.run.steps.length === 0) return;
        const last = replay.run.steps.length - 1;
        set({ replay: { ...replay, index: Math.min(Math.max(index, 0), last) } });
      },

      stopReplay() {
        set({ replay: null });
      },
    };
  });
}

/** Rularea care e acum în curs (ultima pornită și neterminată). */
export function activeRun(runs: readonly RunView[]): RunView | undefined {
  return [...runs].reverse().find((r) => r.status === "running");
}

/** Scorul de accesibilitate înainte și după, din pașii `audit_ui` reușiți ai rulării. */
export function auditScores(steps: readonly AgentStep[]): { before?: number; after?: number } {
  const scores = steps.filter((s) => s.tool === "audit_ui").flatMap((s) => scoreOf(s.result));
  if (scores.length === 0) return {};
  return { before: scores[0], after: scores.length > 1 ? scores[scores.length - 1] : undefined };
}

/** Rezultatul vine de pe server: îl verificăm înainte să-l citim. */
function scoreOf(result: AgentStep["result"]): number[] {
  if (!result?.ok) return [];
  const data: unknown = result.data;
  if (typeof data !== "object" || data === null || !("score" in data)) return [];
  return typeof data.score === "number" ? [data.score] : [];
}

/** Revizia config-ului de arătat la un pas din reluare: cea de după pas, altfel cea de dinainte. */
export function revisionAtStep(step: AgentStep): number | undefined {
  return step.configRevisionAfter ?? step.configRevisionBefore;
}
