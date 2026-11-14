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

/** Pentru o rulare pornită înainte de reload: ținta și originea nu vin în `step`, deci arătăm ceva neutru. */
const UNKNOWN_GOAL = "Rulare în curs";
const UNKNOWN_ORIGIN: RunOrigin = "user";

export function createJournalStore(): JournalStore {
  // Promisiunea nu e date de afișat, deci nu stă în stare.
  let resolveProposal: ((decision: ProposalDecision) => void) | null = null;

  return createStore<JournalState>()((set, get) => {
    function addRun(run: RunView) {
      set((s) => ({ runs: [...s.runs.filter((r) => r.runId !== run.runId), run].slice(-MAX_RUNS_KEPT) }));
    }

    /** După un reload în timpul rulării, `run_started` a trecut deja: rularea se creează din primul mesaj văzut. */
    function updateRun(runId: string, change: (run: RunView) => RunView) {
      if (!get().runs.some((r) => r.runId === runId)) {
        addRun({ runId, goal: UNKNOWN_GOAL, origin: UNKNOWN_ORIGIN, status: "running", steps: [] });
      }
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
            addRun({ runId: message.runId, goal: message.goal, origin: message.origin, status: "running", steps: [] });
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

/**
 * Problemele mari de accesibilitate (`severity: "error"`) înainte și după, din pașii audit_ui. Nota (0–100) se oprește
 * la 0 pe site-urile mari (fiecare problemă mare taie 8 puncte), deci „0 → 0” ascundea ce a reparat agentul; numărul
 * problemelor nu. Comparăm doar auditurile aceleiași zone (același regionId), altfel o scădere ar fi falsă.
 * `introduced`: câte a adus agentul, în ultimul audit.
 */
export function auditIssueCounts(steps: readonly AgentStep[]): {
  before?: number;
  after?: number;
  introduced?: number;
} {
  const audits = steps
    .filter((s) => s.tool === "audit_ui")
    .flatMap((s) => {
      const issues = issuesOf(s.result);
      return issues ? [{ region: regionOf(s.args), issues }] : [];
    });
  const first = audits[0];
  if (!first) return {};
  const last = audits
    .slice(1)
    .reverse()
    .find((a) => a.region === first.region);
  const errors = (issues: IssueLike[]) => issues.filter((i) => i.severity === "error").length;
  return {
    before: errors(first.issues),
    after: last ? errors(last.issues) : undefined,
    introduced: (last ?? first).issues.filter((i) => i.introduced === true).length,
  };
}

type IssueLike = { severity?: unknown; introduced?: unknown };

/** Lista de probleme a unui audit reușit; rezultatul vine de pe server, deci îl verificăm. */
function issuesOf(result: AgentStep["result"]): IssueLike[] | null {
  if (!result?.ok) return null;
  const data: unknown = result.data;
  if (typeof data !== "object" || data === null || !("issues" in data) || !Array.isArray(data.issues)) return null;
  return data.issues.filter((i): i is IssueLike => typeof i === "object" && i !== null);
}

function regionOf(args: unknown): string {
  return typeof args === "object" && args !== null && "regionId" in args && typeof args.regionId === "string"
    ? args.regionId
    : "";
}

/** Revizia config-ului de arătat la un pas din reluare: cea de după pas, altfel cea de dinainte. */
export function revisionAtStep(step: AgentStep): number | undefined {
  return step.configRevisionAfter ?? step.configRevisionBefore;
}
