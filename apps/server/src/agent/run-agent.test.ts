// Bucla cu un decider și o legătură (RunIO) controlate din test.

import { describe, expect, it } from "vitest";
import type { AgentRun, ServerMessage, ToolName } from "@uishapeshifter/contracts";
import { OpenRouterError } from "./openrouter";
import { pageSnapshot } from "./page-snapshot.fixture";
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

/** Un decider care spune pe rând deciziile din listă (ultima se repetă). */
function scripted(decisions: Decision[]): Decider {
  let next = 0;
  return { model: "test", decide: async () => decisions[Math.min(next++, decisions.length - 1)] };
}
const toolCall = (name: Decision extends infer D ? (D extends { name: infer N } ? N : never) : never, args: unknown) =>
  ({ kind: "tool", name, args, content: "Observ: a. Fac: b. Pentru că: c." }) as Decision;
const finish = toolCall("finish", { summary: "Gata.", success: true });

describe("runAgent, eșecurile din specs/05 (A4)", () => {
  it("element negăsit: pasul intră în jurnal ca eșuat, iar rularea continuă", async () => {
    const { io } = fakeIO({
      callWebTool: async () => ({ ok: false, error: { code: "ELEMENT_NOT_FOUND", message: "Nu există e.9." } }),
    });
    const run = await runAgent(
      newRun(),
      scripted([toolCall("point_at", { elementId: "e.9", message: "x" }), finish]),
      io,
    );
    expect(run.steps[0].result).toMatchObject({ ok: false, error: { code: "ELEMENT_NOT_FOUND" } });
    expect(run.status).toBe("succeeded");
  });

  it("CSS respins, apoi aceeași cerere din nou: a doua nu mai pleacă spre pagină", async () => {
    const { io, webCalls } = fakeIO({
      callWebTool: async (name) => {
        webCalls.push(name);
        return { ok: false, error: { code: "INVALID_ARGS", message: "Nu a rămas nimic de aplicat." } };
      },
    });
    const same = toolCall("apply_css", { css: "x{background:url(a)}", reason: "r" });
    const run = await runAgent(newRun(), scripted([same, same, finish]), io);
    expect(webCalls).toEqual(["apply_css"]); // a doua oară, garda răspunde în locul paginii
    expect((run.steps[1].result as { error: { message: string } }).error.message).toContain("Ai mai încercat");
  });

  it("TIMEOUT de la pagină (tab închis, pagină înghețată): pas eșuat, rularea continuă", async () => {
    const { io } = fakeIO({
      callWebTool: async () => ({ ok: false, error: { code: "TIMEOUT", message: "Interfața n-a răspuns." } }),
    });
    const run = await runAgent(newRun(), scripted([toolCall("get_page_snapshot", {}), finish]), io);
    expect(run.steps[0].result).toMatchObject({ ok: false, error: { code: "TIMEOUT" } });
    expect(run.status).toBe("succeeded");
  });

  it("pagina s-a schimbat între pași (alt site): rularea se oprește fără alte schimbări", async () => {
    const { io, webCalls, sent } = fakeIO({
      callWebTool: async (name) => {
        webCalls.push(name);
        return { ok: true, data: pageSnapshot({ host: "alt.example" }) };
      },
    });
    const decider = scripted([toolCall("get_page_snapshot", {}), toolCall("apply_css", { css: "a{}", reason: "r" })]);
    const run = await runAgent(newRun(), decider, io, { host: "video.example" });
    expect(run.status).toBe("failed");
    expect(run.summary).toContain("alt.example");
    expect(webCalls).toEqual(["get_page_snapshot"]); // apply_css nu mai pleacă
    expect(sent.at(-1)).toMatchObject({ type: "run_finished", success: false });
  });

  it("maxSteps: modelul nu închide niciodată → rularea se oprește cu ce a reușit", async () => {
    const { io } = fakeIO();
    let n = 0;
    const decider: Decider = {
      model: "test",
      decide: async () => toolCall("get_page_snapshot", { regionId: `r.${n++}` }),
    };
    const run = await runAgent(newRun(), decider, io);
    expect(run.status).toBe("failed");
    expect(run.steps).toHaveLength(15);
    expect(run.summary).toContain("prea mulți pași");
  });

  it("OpenRouter nu răspunde (după reîncercări): mesaj de conexiune și oprire curată", async () => {
    const { io, sent } = fakeIO();
    const decider: Decider = {
      model: "test",
      decide: async () => {
        throw new OpenRouterError("OpenRouter 503: down", 503, true);
      },
    };
    const run = await runAgent(newRun(), decider, io);
    expect(run.status).toBe("failed");
    expect(sent).toContainEqual(
      expect.objectContaining({ type: "agent_message", text: expect.stringContaining("conexiune") }),
    );
  });
});
