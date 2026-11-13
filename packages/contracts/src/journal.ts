// Jurnalul unei rulări a agentului: fiecare pas, afișat live în panou și reluat pas cu pas după terminare.
// Stocat pe server: data/runs/<runId>.json.

import type { ToolName, ToolResult } from "./tools";

export type RunOrigin = "user" | "adaptation" | "onboarding";

export interface AgentStep {
  runId: string;
  index: number;            // 0, 1, 2…
  ts: string;
  observation: string;      // ce a văzut, pe scurt (ex. „Butonul Trimite are 32px, sub minimul de 44px.”)
  decision: string;         // ce face acum
  reason: string;           // de ce (din răspunsul modelului)
  tool?: ToolName;
  args?: unknown;
  result?: ToolResult;
  durationMs?: number;
  configRevisionBefore?: number;
  configRevisionAfter?: number;
}

export interface AgentRun {
  runId: string;
  userId: string;
  origin: RunOrigin;
  goal: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  summary?: string;
  steps: AgentStep[];
  model: string;            // modelul din OpenRouter
}

export const RUN_LIMITS = {
  maxSteps: 15,             // după atât, agentul se oprește și spune ce a reușit
  maxToolRetries: 2,        // aceeași unealtă eșuată de 2 ori => alt plan sau ask_user
  toolTimeoutMs: 15000,     // o unealtă din frontend care nu răspunde
  waitForClickMaxMs: 60000,
} as const;
