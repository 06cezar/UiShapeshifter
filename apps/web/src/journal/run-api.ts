// Citirea unei rulări terminate pentru reluarea pas cu pas: GET /api/runs/:runId (specs/06).

import type { AgentRun } from "@uishapeshifter/contracts";

const RUN_STATUSES: readonly string[] = ["running", "succeeded", "failed", "cancelled"];

export async function fetchRun(apiUrl: string, runId: string): Promise<AgentRun> {
  const response = await fetch(`${apiUrl}/runs/${encodeURIComponent(runId)}`);
  if (!response.ok) throw new Error(`Rularea ${runId} nu s-a putut citi (${response.status}).`);
  const body: unknown = await response.json();
  if (!isAgentRun(body)) throw new Error(`Rularea ${runId} a venit într-o formă necunoscută.`);
  return body;
}

/** Verifică doar câmpurile de care are nevoie panoul; pașii îi citește cu `?.`. */
export function isAgentRun(value: unknown): value is AgentRun {
  if (typeof value !== "object" || value === null) return false;
  const run = value as Record<string, unknown>;
  return (
    typeof run.runId === "string" &&
    typeof run.goal === "string" &&
    typeof run.status === "string" &&
    RUN_STATUSES.includes(run.status) &&
    Array.isArray(run.steps) &&
    run.steps.every(
      (s: unknown) => typeof s === "object" && s !== null && typeof (s as { index?: unknown }).index === "number",
    )
  );
}
