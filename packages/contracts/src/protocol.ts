// Protocolul dintre frontend și server. Detalii și diagrame: specs/06-protocol.md.
//
// WebSocket: ws://localhost:8787/ws   (un socket pe tab; sesiunea se leagă prin mesajul "hello")
// HTTP:      http://localhost:8787/api/...

import type { AgentRun, AgentStep, RunOrigin } from "./journal";
import type { UsageSignal } from "./signals";
import type { ToolArgs, ToolName, ToolResult } from "./tools";

export const SERVER_PORT = 8787;
export const WEB_PORT = 5173;

export type MascotState = "idle" | "listening" | "thinking" | "speaking" | "pointing" | "happy" | "confused";

/** Pagina din care vine cererea (extensia): agentul știe pe ce site lucrează. Lipsește pe pagina de probă. */
export interface PageInfo {
  url: string;
  host: string;   // fără „www.”; cheia rețetei
  title: string;
}

// ---------- frontend -> server ----------

export type ClientMessage =
  | { type: "hello"; userId: string; sessionId: string }
  | { type: "user_message"; text: string; source: "text" | "voice"; page?: PageInfo }
  | { type: "tool_result"; callId: string; result: ToolResult }
  | { type: "signals"; signals: UsageSignal[] }   // trimise în loturi, cel mult o dată la 5 s
  | { type: "cancel_run"; runId: string };

// ---------- server -> frontend ----------

export type ServerMessage =
  | { type: "run_started"; runId: string; goal: string; origin: RunOrigin }
  | { type: "step"; step: AgentStep }               // după fiecare pas: panoul jurnal se actualizează
  | {
      type: "tool_call";                             // doar pentru uneltele cu TOOL_RUNS_ON === "web"
      runId: string;
      callId: string;
      name: ToolName;
      args: ToolArgs[ToolName];
    }
  | { type: "agent_message"; runId?: string; text: string; mascot: MascotState }
  | { type: "run_finished"; runId: string; success: boolean; summary: string }
  | { type: "error"; message: string };

// ---------- HTTP ----------
//
// GET  /api/health                         -> { ok: true }
// GET  /api/profile/:userId                -> UserProfile (creat cu valori implicite dacă nu există)
// PUT  /api/profile/:userId/onboarding     <- OnboardingResult  -> UserProfile
// GET  /api/config/:userId                 -> UIConfig (ultima salvată)
// PUT  /api/config/:userId                 <- UIConfig          -> { revision }
// GET  /api/runs?userId=…                  -> { runId, goal, status, startedAt }[]
// GET  /api/runs/:runId                    -> AgentRun (pentru reluarea pas cu pas)
// GET  /api/recipes/:userId                -> SiteRecipe[] (toate rețetele omului; pentru sincronizare, doar cu cont)
// GET  /api/recipes/:userId/:host          -> SiteRecipe (404 dacă nu există)
// PUT  /api/recipes/:userId/:host          <- SiteRecipe        -> { revision }
// DELETE /api/recipes/:userId/:host        -> { ok: true }      („Revino la original”)

export type RunListItem = Pick<AgentRun, "runId" | "goal" | "status" | "startedAt" | "origin">;
