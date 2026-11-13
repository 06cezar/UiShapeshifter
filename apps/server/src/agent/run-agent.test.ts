// Bucla cu un decider și o legătură (RunIO) controlate din test.

import { describe, expect, it } from "vitest";
import type { AgentRun, ServerMessage, ToolName } from "@uishapeshifter/contracts";
import { runAgent, type Decider, type Decision, type RunIO } from "./run-agent";

function newRun(): AgentRun {
  return {
    runId: "run-test",
    userId: "maria",
    origin: "user",
    goal: "x",
    startedAt: new Date().toISOString(),
    status: "running",
    steps: [],
    model: "test",
  };
}

function fakeIO(overrides: Partial<RunIO> = {}) {
  const sent: ServerMessage[] = [];
  const webCalls: ToolName[] = [];
  const io: RunIO = {
    callWebTool: async (name) => {
      webCalls.push(name);
      return { ok: true, data: {} };
    },
    callServerTool: async () => ({ ok: true, data: { runId: "run-test" } }),
    send: (message) => sent.push(message),
    saveRun: async () => {},
    isCancelled: () => false,
    isReplaced: () => false,
    ...overrides,
  };
  return { io, sent, webCalls };
}

const snapshotCall: Decision = { kind: "tool", name: "get_ui_snapshot", args: {}, content: "Observ: a. Fac: b." };

describe("runAgent", () => {
  it("„Oprește” apăsat în timpul decide(): unealta decisă nu mai pleacă spre interfață", async () => {
    let cancelled = false;
    const decider: Decider = {
      model: "test",
      decide: async () => {
        cancelled = true; // omul apasă Oprește cât gândește modelul
        return snapshotCall;
      },
    };
    const { io, sent, webCalls } = fakeIO({ isCancelled: () => cancelled });
    const run = await runAgent(newRun(), decider, io);
    expect(webCalls).toEqual([]);
    expect(run.status).toBe("cancelled");
    expect(sent.map((m) => m.type)).toEqual(["agent_message", "run_finished"]);
  });

  it("o rulare înlocuită de una nouă se termină fără agent_message", async () => {
    const decider: Decider = { model: "test", decide: async () => snapshotCall };
    const { io, sent } = fakeIO({ isCancelled: () => true, isReplaced: () => true });
    const run = await runAgent(newRun(), decider, io);
    expect(run.status).toBe("cancelled");
    expect(sent.map((m) => m.type)).toEqual(["run_finished"]);
  });

  it("dacă jurnalul nu se poate salva, interfața primește totuși run_finished", async () => {
    const decider: Decider = {
      model: "test",
      decide: async () => ({ kind: "tool", name: "finish", args: { summary: "Gata.", success: true }, content: "" }),
    };
    const { io, sent } = fakeIO({
      saveRun: async () => {
        throw new Error("EPERM");
      },
    });
    const run = await runAgent(newRun(), decider, io);
    expect(run.status).toBe("failed"); // salvarea pasului a picat → rularea se încheie ca eșuată, curat
    expect(sent.at(-1)).toMatchObject({ type: "run_finished", success: false });
  });
});
