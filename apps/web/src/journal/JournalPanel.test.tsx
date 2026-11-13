import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentRun, AgentStep, ClientMessage } from "@uishapeshifter/contracts";
import { createConfigStore } from "../ui/config-store";
import { ConfigStoreProvider } from "../ui/config-store-context";
import { fakeContrast, NORMAL_THRESHOLDS } from "../ui/test-fixtures";
import { createJournalStore } from "./journal-store";
import { JournalPanel } from "./JournalPanel";

const API_URL = "http://test/api";

afterEach(() => vi.unstubAllGlobals());

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

async function renderPanel() {
  const config = createConfigStore({ contrastRatio: fakeContrast(), thresholds: NORMAL_THRESHOLDS });
  const journal = createJournalStore();
  const sent: ClientMessage[] = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <ConfigStoreProvider store={config}>
        <JournalPanel journal={journal} send={(m) => sent.push(m)} apiUrl={API_URL} />
      </ConfigStoreProvider>,
    ),
  );
  const byId = (id: string) => container.querySelector<HTMLElement>(`[data-agent-id='${id}']`);
  return { config, journal, sent, container, byId };
}

describe("JournalPanel", () => {
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
          tool: "patch_config",
          result: { ok: false, error: { code: "LIMIT_VIOLATION", message: "x" } },
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
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(run)));
    vi.stubGlobal("fetch", fetchMock);
    const { journal, container, byId } = await renderPanel();
    await act(async () => {
      const { handleServerMessage } = journal.getState();
      handleServerMessage({ type: "run_started", runId: "r1", goal: "Butoane mai mari", origin: "user" });
      handleServerMessage({ type: "run_finished", runId: "r1", success: true, summary: "Gata." });
    });

    await act(async () => byId("journal-panel.replay")?.click());
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/runs/r1`);
    expect(container.textContent).toContain("Pasul 1 din 2, revizia 1");

    await act(async () => byId("journal-panel.replay-next")?.click());
    expect(container.textContent).toContain("Pasul 2 din 2, revizia 2");
    expect(byId("journal-panel.replay-next")?.hasAttribute("disabled")).toBe(true);

    await act(async () => byId("journal-panel.replay-close")?.click());
    expect(byId("journal-panel.replay")).not.toBeNull();
  });

  it("Păstrez / Anulez apare pentru o propunere și o închide", async () => {
    const { journal, container, byId } = await renderPanel();
    let decision: Promise<string> = Promise.resolve("");
    await act(async () => {
      decision = journal
        .getState()
        .requestProposalDecision({
          proposalId: "p1",
          title: "Font mai mare",
          summary: "Textul crește la 20px.",
          revisionBefore: 0,
        });
    });
    expect(container.textContent).toContain("Font mai mare");

    await act(async () => byId("journal-panel.keep")?.click());
    await expect(decision).resolves.toBe("keep");
    expect(byId("journal-panel.keep")).toBeNull();
  });

  it("istoricul arată cine a schimbat și „Revino aici” face undo", async () => {
    const { config, container, byId } = await renderPanel();
    await act(async () => {
      config
        .getState()
        .applyPatch([{ op: "replace", path: "/theme/baseFontPx", value: 20 }], {
          by: "agent",
          reason: "Text mai mare",
        });
    });
    expect(container.textContent).toContain("Vulpița: Text mai mare");

    await act(async () => byId("journal-panel.revert.0")?.click());
    expect(config.getState().config.theme.baseFontPx).toBe(16);
    expect(config.getState().config.revision).toBe(2);
  });

  it("se poate ascunde", async () => {
    const { container, byId } = await renderPanel();
    await act(async () => byId("journal-panel.toggle")?.click());
    expect(container.querySelector(".journal-body")).toBeNull();
    expect(byId("journal-panel.toggle")?.getAttribute("aria-expanded")).toBe("false");
  });
});
