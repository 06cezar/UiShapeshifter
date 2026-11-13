// Jurnalul rulărilor: data/runs/<runId>.json, rescris după fiecare pas, ca reluarea să meargă și în timpul rulării.

import { readdir } from "node:fs/promises";
import type { AgentRun, RunListItem } from "@uishapeshifter/contracts";
import { dataPath, isSafeId, readJson, writeJson } from "../storage/json-files";

const RUNS_DIR = "runs";

function runPath(runId: string): string {
  return dataPath(RUNS_DIR, `${runId}.json`);
}

function isAgentRun(value: unknown): value is AgentRun {
  const run = value as AgentRun | null;
  return (
    typeof run === "object" &&
    run !== null &&
    typeof run.runId === "string" &&
    typeof run.userId === "string" &&
    typeof run.goal === "string" &&
    Array.isArray(run.steps)
  );
}

export async function saveRun(run: AgentRun): Promise<void> {
  await writeJson(runPath(run.runId), run);
}

export async function loadRun(runId: string): Promise<AgentRun | null> {
  if (!isSafeId(runId)) return null;
  const value = await readJson(runPath(runId));
  return isAgentRun(value) ? value : null;
}

/** Rulările unui utilizator, cele mai noi primele. */
export async function listRuns(userId: string): Promise<RunListItem[]> {
  let files: string[];
  try {
    files = await readdir(dataPath(RUNS_DIR));
  } catch {
    return []; // încă nicio rulare
  }
  const runs = await Promise.all(
    files.filter((file) => file.endsWith(".json")).map((file) => loadRun(file.slice(0, -".json".length))),
  );
  return runs
    .filter((run): run is AgentRun => run !== null && run.userId === userId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(({ runId, goal, status, startedAt, origin }) => ({ runId, goal, status, startedAt, origin }));
}
