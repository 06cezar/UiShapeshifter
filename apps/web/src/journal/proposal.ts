// Unealta `propose_changes` pe un site (specs/05, D9): schimbările rulării sunt deja în pagină, ca previzualizare;
// panoul arată „Păstrez / Anulez”, iar „Anulez” readuce site-ul cum era înainte de rulare.

import type { ToolData, ToolResult } from "@uishapeshifter/contracts";
import type { ProposalDecision } from "./journal-store";

export interface ProposalDeps {
  /** Arată bara din panou și așteaptă alegerea omului. */
  ask(proposal: {
    proposalId: string;
    title: string;
    summary: string;
    revisionBefore: number;
  }): Promise<ProposalDecision>;
  /** Revizia rețetei de la începutul rulării (sau cea de acum, dacă rularea a pornit înainte de reîncărcare). */
  revisionBefore(runId: string | undefined): number;
  currentRevision(): number;
  /** Readuce rețeta de la începutul rulării; întoarce revizia rămasă. */
  undoRun(runId: string | undefined): Promise<number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function newProposalId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function proposeChanges(
  args: unknown,
  runId: string | undefined,
  deps: ProposalDeps,
): Promise<ToolResult<ToolData["propose_changes"]>> {
  const a = isRecord(args) ? args : {};
  if (typeof a.title !== "string" || !a.title.trim() || typeof a.summary !== "string" || !a.summary.trim()) {
    return {
      ok: false,
      error: {
        code: "INVALID_ARGS",
        message: "propose_changes cere title (scurt) și summary (ce s-a schimbat, pe înțeles).",
      },
    };
  }
  const proposalId = newProposalId();
  const decision = await deps.ask({
    proposalId,
    title: a.title.trim(),
    summary: a.summary.trim(),
    revisionBefore: deps.revisionBefore(runId),
  });
  const revision = decision === "undo" ? await deps.undoRun(runId) : deps.currentRevision();
  return { ok: true, data: { proposalId, decision, revision } };
}
