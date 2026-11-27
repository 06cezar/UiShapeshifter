import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { AgentRun, AgentStep, ClientMessage } from "@uishapeshifter/contracts";
import { createJournalStore } from "./journal-store";
import { JournalPanel, type JournalPanelProps } from "./JournalPanel";

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

async function renderPanel(extra: Partial<Omit<JournalPanelProps, "journal" | "send">> = {}) {
  const journal = createJournalStore();
  const sent: ClientMessage[] = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(<JournalPanel journal={journal} send={(m) => sent.push(m)} {...extra} />),
  );
  const byId = (id: string) => container.querySelector<HTMLElement>(`[data-agent-id='${id}']`);
  const startRun = () =>
    act(async () =>
      journal
        .getState()
        .handleServerMessage({ type: "run_started", runId: "r1", goal: "Mută căutarea sus", origin: "user" }),
    );
  return { journal, sent, container, byId, startRun };
}

describe("JournalPanel", () => {
  it("arată problemele de accesibilitate înainte → după, nu nota care stă la 0 pe site-urile mari", async () => {
    const { journal, container, startRun } = await renderPanel();
    await startRun();
    const errors = (n: number) => [...Array(n)].map(() => ({ severity: "error" }));
    await act(async () => {
      const { handleServerMessage } = journal.getState();
      handleServerMessage({
        type: "step",
        step: step(0, { tool: "audit_ui", args: {}, result: { ok: true, data: { score: 0, issues: errors(50) } } }),
      });
      handleServerMessage({
        type: "step",
        step: step(1, { tool: "audit_ui", args: {}, result: { ok: true, data: { score: 0, issues: errors(30) } } }),
      });
    });
    expect(container.textContent).toContain("Probleme de accesibilitate: 50 → 30, niciuna nouă");
    expect(container.textContent).not.toContain("0 → 0");
    await act(async () => {
      journal.getState().handleServerMessage({
        type: "step",
        step: step(2, {
          tool: "audit_ui",
          args: {},
          result: { ok: true, data: { score: 0, issues: [...errors(29), { severity: "error", introduced: true }] } },
        }),
      });
    });
    expect(container.textContent).toContain("Probleme de accesibilitate: 50 → 30, 1 nouă");
  });

  it("pe un site unde agentul n-a lucrat, panoul nu apare", async () => {
    const { container, startRun } = await renderPanel();
    expect(container.querySelector(".journal")).toBeNull();
    await startRun();
    expect(container.querySelector(".journal")).not.toBeNull();
  });

  it("arată pașii live, scorul, și Oprește trimite cancel_run", async () => {
    const { journal, sent, container, byId } = await renderPanel();
    await act(async () => {
      const { handleServerMessage } = journal.getState();
      handleServerMessage({ type: "run_started", runId: "r1", goal: "Butoane mai mari", origin: "user" });
      handleServerMessage({
        type: "step",
        step: step(0, { tool: "audit_ui", result: { ok: true, data: { score: 62 } } }),
      });
      handleServerMessage({
        type: "step",
        step: step(1, {
          tool: "apply_css",
          result: { ok: false, error: { code: "INVALID_ARGS", message: "x" } },
        }),
      });
    });

    expect(container.textContent).toContain("Butoane mai mari");
    expect(container.textContent).toContain("Accesibilitate: 62 din 100");
    expect(container.querySelectorAll(".journal-step")).toHaveLength(2);
    expect(container.querySelector(".journal-step-fail")?.textContent).toContain("nu a mers");

    await act(async () => byId("journal-panel.stop")?.click());
    expect(sent).toEqual([{ type: "cancel_run", runId: "r1" }]);
    expect(byId("journal-panel.stop")?.hasAttribute("disabled")).toBe(true);
  });

  it("după terminare, „Reia pas cu pas” încarcă rularea și o parcurge", async () => {
    const run: AgentRun = {
      runId: "r1",
      userId: "u1",
      origin: "user",
      goal: "Butoane mai mari",
      startedAt: "2026-11-13T15:00:00.000Z",
      status: "succeeded",
      steps: [step(0, { configRevisionAfter: 1 }), step(1, { configRevisionAfter: 2 })],
      model: "test",
    };
    const loadRun = vi.fn(async () => run);
    const { journal, container, byId } = await renderPanel({ loadRun });
    await act(async () => {
      const { handleServerMessage } = journal.getState();
      handleServerMessage({ type: "run_started", runId: "r1", goal: "Butoane mai mari", origin: "user" });
      handleServerMessage({ type: "run_finished", runId: "r1", success: true, summary: "Gata." });
    });

    await act(async () => byId("journal-panel.replay")?.click());
    expect(loadRun).toHaveBeenCalledWith("r1");
    expect(container.textContent).toContain("Pasul 1 din 2, revizia 1");

    await act(async () => byId("journal-panel.replay-next")?.click());
    expect(container.textContent).toContain("Pasul 2 din 2, revizia 2");
    expect(byId("journal-panel.replay-next")?.hasAttribute("disabled")).toBe(true);

    await act(async () => byId("journal-panel.replay-close")?.click());
    expect(byId("journal-panel.replay")).not.toBeNull();
  });

  it("fără loadRun, reluarea nu se oferă", async () => {
    const { journal, byId } = await renderPanel();
    await act(async () => {
      const { handleServerMessage } = journal.getState();
      handleServerMessage({ type: "run_started", runId: "r1", goal: "x", origin: "user" });
      handleServerMessage({ type: "run_finished", runId: "r1", success: true, summary: "Gata." });
    });
    expect(byId("journal-panel.replay")).toBeNull();
  });

  it("Păstrez / Anulez apare pentru o propunere și o închide", async () => {
    const { journal, container, byId } = await renderPanel();
    let decision: Promise<string> = Promise.resolve("");
    await act(async () => {
      decision = journal.getState().requestProposalDecision({
        proposalId: "p1",
        title: "Căutarea sus",
        summary: "Am mutat căutarea deasupra meniului.",
        revisionBefore: 0,
      });
    });
    expect(container.textContent).toContain("Căutarea sus");

    await act(async () => byId("journal-panel.undo")?.click());
    await expect(decision).resolves.toBe("undo");
    expect(byId("journal-panel.undo")).toBeNull();
  });

  it("„Revino la original” cheamă golirea rețetei și confirmă", async () => {
    const revertToOriginal = vi.fn(async () => {});
    const { journal, container, byId, startRun } = await renderPanel({ revertToOriginal });
    await startRun();
    await act(async () =>
      journal.getState().handleServerMessage({ type: "run_finished", runId: "r1", success: true, summary: "gata" }),
    );
    await act(async () => byId("journal-panel.revert-original")?.click());
    expect(revertToOriginal).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Site-ul arată din nou ca la început.");
  });

  it("„Revino la original” cât rulează agentul: oprește rularea, închide propunerea și golește din nou la final", async () => {
    const revertToOriginal = vi.fn(async () => {});
    const { journal, sent, container, byId, startRun } = await renderPanel({ revertToOriginal });
    await startRun();
    let decision: Promise<string> | undefined;
    await act(async () => {
      decision = journal
        .getState()
        .requestProposalDecision({ proposalId: "p1", title: "Căutarea sus", summary: "x", revisionBefore: 0 });
    });

    await act(async () => byId("journal-panel.revert-original")?.click());
    expect(sent).toContainEqual({ type: "cancel_run", runId: "r1" });
    await expect(decision).resolves.toBe("keep");
    expect(revertToOriginal).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Opresc agentul");

    await act(async () =>
      journal.getState().handleServerMessage({ type: "run_finished", runId: "r1", success: false, summary: "oprit" }),
    );
    expect(revertToOriginal).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Site-ul arată din nou ca la început.");
  });

  it("„Ce ai cerut aici”: Anulez scoate doar cererea aleasă, cât nu rulează agentul", async () => {
    let entries = [
      { requestId: "r0", reason: "Ascunde reclamele", at: "2026-11-14T01:00:00.000Z", revisions: [1] },
      { requestId: "r1", reason: "Mută căutarea sus", at: "2026-11-14T01:05:00.000Z", revisions: [2, 3] },
    ];
    const undoRequest = vi.fn(async (requestId: string) => {
      entries = entries.filter((e) => e.requestId !== requestId);
      return { ok: true as const };
    });
    const { journal, container, byId, startRun } = await renderPanel({ requestHistory: () => entries, undoRequest });
    await startRun();
    expect(container.textContent).toContain("Ce ai cerut aici");
    expect((byId("journal-panel.undo-request.r0") as HTMLButtonElement).disabled).toBe(true); // rulează agentul

    await act(async () =>
      journal.getState().handleServerMessage({ type: "run_finished", runId: "r1", success: true, summary: "gata" }),
    );
    await act(async () => byId("journal-panel.undo-request.r0")?.click());
    expect(undoRequest).toHaveBeenCalledWith("r0");
    expect(byId("journal-panel.undo-request.r0")).toBeNull();
    expect(byId("journal-panel.undo-request.r1")).not.toBeNull();
    expect(container.textContent).toContain("Am scos: Ascunde reclamele");
  });

  it("după rulare, pașii se strâng sub „Pașii (n)”; cât rulează, se văd", async () => {
    const { journal, container, startRun } = await renderPanel();
    await startRun();
    await act(async () => journal.getState().handleServerMessage({ type: "step", step: step(0) }));
    expect(container.querySelector(".journal-steps-done")).toBeNull();
    expect(container.querySelector(".journal-steps")).not.toBeNull();
    await act(async () =>
      journal.getState().handleServerMessage({ type: "run_finished", runId: "r1", success: true, summary: "gata" }),
    );
    const done = container.querySelector<HTMLDetailsElement>(".journal-steps-done");
    expect(done?.open).toBe(false);
    expect(done?.querySelector("summary")?.textContent).toBe("Pașii (1)");
  });

  it("după F5, fără rulare, panoul nu apare nici dacă site-ul are cereri (se anulează din chat sau popup)", async () => {
    const entries = [{ requestId: "r0", reason: "Ascunde reclamele", at: "2026-11-13T20:00:00.000Z", revisions: [1] }];
    const { container } = await renderPanel({
      requestHistory: () => entries,
      undoRequest: async () => ({ ok: true as const }),
    });
    expect(container.querySelector(".journal")).toBeNull();
  });

  it("fără rulare și fără cereri, panoul tot nu apare", async () => {
    const { container } = await renderPanel({
      requestHistory: () => [],
      undoRequest: async () => ({ ok: true as const }),
    });
    expect(container.querySelector(".journal")).toBeNull();
  });

  it("„Ascunde” îl scoate de tot; o rulare nouă îl aduce înapoi", async () => {
    const { journal, container, byId, startRun } = await renderPanel();
    await startRun();
    await act(async () => byId("journal-panel.toggle")?.click());
    expect(container.querySelector(".journal")).toBeNull();
    await act(async () => journal.getState().handleServerMessage({ type: "step", step: step(0) }));
    expect(container.querySelector(".journal")).toBeNull(); // pașii aceleiași rulări nu-l redeschid
    await act(async () =>
      journal
        .getState()
        .handleServerMessage({ type: "run_started", runId: "r2", goal: "Mărește textul", origin: "user" }),
    );
    expect(container.querySelector(".journal")).not.toBeNull();
  });
  it("pasul run_js arată la vedere ce vrea să facă, codul și ce s-a întâmplat", async () => {
    const { journal, byId, startRun } = await renderPanel();
    await startRun();
    const code = "speechSynthesis.speak(new SpeechSynthesisUtterance('Salut'))";
    await act(async () =>
      journal.getState().handleServerMessage({
        type: "step",
        step: step(0, {
          tool: "run_js",
          args: { code, purpose: "Citește articolul cu voce" },
          result: { ok: true, data: { status: "ran" } },
        }),
      }),
    );
    const block = byId("journal-panel.run-js");
    expect(block?.textContent).toContain("Citește articolul cu voce");
    expect(block?.querySelector("pre")?.textContent).toBe(code);
    expect(block?.textContent).toContain("reîncarcă pagina");
    expect(block?.closest("details")?.open).toBe(true);
  });

  it("run_js cu argumente stricate nu arată blocul de cod", async () => {
    const { journal, byId, startRun } = await renderPanel();
    await startRun();
    await act(async () =>
      journal.getState().handleServerMessage({ type: "step", step: step(0, { tool: "run_js", args: { code: 3 } }) }),
    );
    expect(byId("journal-panel.run-js")).toBeNull();
  });

  it("run_js cu modul expert oprit spune în panou cum îl pornești", async () => {
    const { journal, byId, startRun } = await renderPanel();
    await startRun();
    await act(async () =>
      journal.getState().handleServerMessage({
        type: "step",
        step: step(0, {
          tool: "run_js",
          args: { purpose: "Descarcă toate facturile", code: "return 1;" },
          result: { ok: true, data: { status: "disabled" } },
        }),
      }),
    );
    const text = byId("journal-panel.run-js")?.textContent ?? "";
    expect(text).toContain("Modul expert e oprit");
    expect(text).toContain("bifează „Mod expert”");
    expect(text).toContain("Allow User Scripts");
  });
});
