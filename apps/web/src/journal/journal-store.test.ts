import { describe, expect, it } from "vitest";
import type { AgentRun, AgentStep } from "@uishapeshifter/contracts";
import { activeRun, auditScores, createJournalStore, revisionAtStep } from "./journal-store";

function step(index: number, extra: Partial<AgentStep> = {}): AgentStep {
  return {
    runId: "r1",
    index,
    ts: "2026-11-13T15:00:00.000Z",
    observation: `observ ${index}`,
    decision: `fac ${index}`,
    reason: `pentru că ${index}`,
    ...extra,
  };
}

function auditStep(index: number, score: number): AgentStep {
  return step(index, { tool: "audit_ui", result: { ok: true, data: { score } } });
}

function startedStore() {
  const journal = createJournalStore();
  journal
    .getState()
    .handleServerMessage({ type: "run_started", runId: "r1", goal: "Butoane mai mari", origin: "user" });
  return journal;
}

describe("journal store", () => {
  it("adună pașii unei rulări live, în ordine, fără dubluri", () => {
    const journal = startedStore();
    const { handleServerMessage } = journal.getState();
    handleServerMessage({ type: "step", step: step(1) });
    handleServerMessage({ type: "step", step: step(0) });
    handleServerMessage({ type: "step", step: step(1, { decision: "retrimis" }) });

    const run = journal.getState().runs[0];
    expect(run?.status).toBe("running");
    expect(run?.steps.map((s) => s.decision)).toEqual(["fac 0", "retrimis"]);
    expect(activeRun(journal.getState().runs)?.runId).toBe("r1");
  });

  it("un pas fără run_started (reload în timpul rulării) creează rularea, nu se pierde", () => {
    const journal = createJournalStore();
    journal.getState().handleServerMessage({ type: "step", step: step(3) });

    const run = journal.getState().runs[0];
    expect(run?.runId).toBe("r1");
    expect(run?.status).toBe("running");
    expect(run?.steps.map((s) => s.index)).toEqual([3]);
  });

  it("run_finished închide rularea; după Oprește, eșecul se vede ca „oprit”", () => {
    const journal = startedStore();
    journal.getState().markCancelRequested("r1");
    journal.getState().handleServerMessage({ type: "run_finished", runId: "r1", success: false, summary: "Oprit." });

    const run = journal.getState().runs[0];
    expect(run?.status).toBe("cancelled");
    expect(run?.summary).toBe("Oprit.");
    expect(journal.getState().cancelRequested).toEqual([]);
    expect(activeRun(journal.getState().runs)).toBeUndefined();
  });

  it("fără Oprește, un eșec rămâne eșec", () => {
    const journal = startedStore();
    journal.getState().handleServerMessage({ type: "run_finished", runId: "r1", success: false, summary: "x" });
    expect(journal.getState().runs[0]?.status).toBe("failed");
  });

  it("Păstrez / Anulez rezolvă promisiunea uneltei propose_changes", async () => {
    const journal = createJournalStore();
    const decision = journal
      .getState()
      .requestProposalDecision({ proposalId: "p1", title: "Font mai mare", summary: "20px", revisionBefore: 3 });
    expect(journal.getState().proposal?.proposalId).toBe("p1");

    journal.getState().decideProposal("undo");
    await expect(decision).resolves.toBe("undo");
    expect(journal.getState().proposal).toBeNull();
  });

  it("reluarea merge pas cu pas și nu iese din capete", () => {
    const journal = createJournalStore();
    const run: AgentRun = {
      runId: "r1",
      userId: "u1",
      origin: "user",
      goal: "g",
      startedAt: "2026-11-13T15:00:00.000Z",
      status: "succeeded",
      steps: [step(0), step(1), step(2)],
      model: "test",
    };
    journal.getState().startReplay(run);
    journal.getState().replayTo(5);
    expect(journal.getState().replay?.index).toBe(2);
    journal.getState().replayTo(-1);
    expect(journal.getState().replay?.index).toBe(0);
    journal.getState().stopReplay();
    expect(journal.getState().replay).toBeNull();
  });
});

describe("auditScores", () => {
  it("ia primul și ultimul scor din pașii audit_ui reușiți", () => {
    const failed = step(1, { tool: "audit_ui", result: { ok: false, error: { code: "INTERNAL", message: "x" } } });
    expect(auditScores([auditStep(0, 62), failed, step(2), auditStep(3, 95)])).toEqual({ before: 62, after: 95 });
  });

  it("un singur audit dă doar scorul de dinainte; un rezultat fără scor e ignorat", () => {
    expect(auditScores([auditStep(0, 70)])).toEqual({ before: 70, after: undefined });
    expect(auditScores([step(0, { tool: "audit_ui", result: { ok: true, data: { score: "mare" } } })])).toEqual({});
  });
});

describe("revisionAtStep", () => {
  it("preferă revizia de după pas", () => {
    expect(revisionAtStep(step(0, { configRevisionBefore: 4, configRevisionAfter: 5 }))).toBe(5);
    expect(revisionAtStep(step(0, { configRevisionBefore: 4 }))).toBe(4);
  });
});
