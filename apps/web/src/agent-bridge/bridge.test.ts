import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolResult, UISnapshot } from "@uishapeshifter/contracts";
import { createConfigStore } from "../ui/config-store";
import type { ConfigStore } from "../ui/config-store";
import { createRegistry } from "../ui/registry";
import { fakeContrast, NORMAL_THRESHOLDS } from "../ui/test-fixtures";
import { startAgentBridge } from "./bridge";
import type { AgentBridge } from "./index";
import { fakeSocketFactory } from "./test-socket";
import type { FakeSocket } from "./test-socket";

const RUN_ID = "run-1";

let root: HTMLElement;
let store: ConfigStore;
let bridge: AgentBridge;
let socket: FakeSocket;

/** Ce a răspuns puntea la apelul cu `callId` (după ce promisiunile s-au terminat). */
async function call(name: string, args: unknown, callId = `c-${name}`): Promise<ToolResult> {
  socket.receive({ type: "tool_call", runId: RUN_ID, callId, name, args });
  await vi.waitFor(() => expect(resultOf(callId)).toBeDefined());
  return resultOf(callId)!;
}

function resultOf(callId: string): ToolResult | undefined {
  const message = socket.sent.find(
    (m): m is { type: "tool_result"; callId: string; result: ToolResult } =>
      typeof m === "object" && m !== null && (m as { callId?: string }).callId === callId,
  );
  return message?.result;
}

beforeEach(() => {
  root = document.createElement("div");
  root.innerHTML = `
    <nav><button data-agent-id="nav.home" style="font-size: 16px">Acasă</button></nav>
    <section data-module-id="home"><button data-agent-id="home.messages" style="font-size: 20px">Mesaje</button></section>`;
  document.body.appendChild(root);
  for (const el of root.querySelectorAll<HTMLElement>("[data-agent-id]")) {
    el.getBoundingClientRect = () => new DOMRect(0, 0, 120, 56);
  }
  store = createConfigStore({ contrastRatio: fakeContrast(), thresholds: NORMAL_THRESHOLDS });
  const createSocket = fakeSocketFactory();
  bridge = startAgentBridge({
    url: "ws://server/ws",
    userId: "maria",
    sessionId: "tab-1",
    store,
    registry: createRegistry(store, root),
    createSocket,
  });
  socket = createSocket.last();
  socket.open();
});

afterEach(() => {
  bridge.stop();
  root.remove();
  vi.restoreAllMocks();
});

describe("secvența agentului fals („Fă textul mai mare”), prin WebSocket", () => {
  it("get_ui_snapshot → patch_config → point_at (fără handler încă) → step / run_finished la abonați", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const steps: number[] = [];
    const finished: boolean[] = [];
    bridge.on("step", (m) => steps.push(m.step.index));
    bridge.on("run_finished", (m) => finished.push(m.success));

    socket.receive({ type: "run_started", runId: RUN_ID, goal: "Fă textul mai mare", origin: "user" });

    // 1. snapshot-ul compact, cu revizia de acum; agentul fals ia fontul cel mai mic de pe ecran
    const snapshot = await call("get_ui_snapshot", {});
    expect(snapshot.ok).toBe(true);
    const data = (snapshot as { data: UISnapshot }).data;
    expect(data).toMatchObject({ route: "home", configRevision: 0 });
    expect(data.elements.map((e) => e.id)).toEqual(["nav.home", "home.messages"]);
    const from = Math.min(...data.elements.map((e) => e.fontPx ?? Infinity));
    expect(from).toBe(16);
    socket.receive({ type: "step", step: { runId: RUN_ID, index: 0 } });

    // 2. patch-ul: 16 → 18, aplicat prin poartă, cu meta-ul agentului în istoric
    const patch = await call("patch_config", {
      ops: [{ op: "replace", path: "/theme/baseFontPx", value: from + 2 }],
      reason: `Text mai mare: ${from}px → ${from + 2}px`,
    });
    expect(patch).toEqual({ ok: true, data: { revision: 1, applied: 1 } });
    expect(store.getState().config.theme.baseFontPx).toBe(18);
    expect(store.getState().history[1].meta).toEqual({
      by: "agent",
      reason: "Text mai mare: 16px → 18px",
      runId: RUN_ID,
    });
    socket.receive({ type: "step", step: { runId: RUN_ID, index: 1 } });

    // 3. point_at e al lui D: până îl înregistrează, INTERNAL imediat (nu TIMEOUT pe server)
    const point = await call("point_at", { elementId: "nav.home", message: "Uite" });
    expect(point).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    socket.receive({ type: "step", step: { runId: RUN_ID, index: 2 } });

    // 4. finish e unealtă de server: aici vin doar pasul și sfârșitul rulării
    socket.receive({ type: "step", step: { runId: RUN_ID, index: 3 } });
    socket.receive({ type: "run_finished", runId: RUN_ID, success: true, summary: "Am mărit textul." });
    expect(steps).toEqual([0, 1, 2, 3]);
    expect(finished).toEqual([true]);
  });
});

describe("uneltele lui B", () => {
  it("patch_config sub limită: LIMIT_VIOLATION cu toate încălcările în details", async () => {
    const result = await call("patch_config", {
      ops: [
        { op: "replace", path: "/theme/baseFontPx", value: 14 },
        { op: "replace", path: "/minTargetPx", value: 30 },
      ],
      reason: "Mai mic",
    });
    expect(result).toMatchObject({ ok: false, error: { code: "LIMIT_VIOLATION" } });
    const error = (result as { error: { message: string; details: { rule: string }[] } }).error;
    expect(error.details.map((v) => v.rule)).toEqual(["min-font", "target-size"]);
    expect(error.message).toContain("minimul pentru acest utilizator e 16px");
    expect(store.getState().config.revision).toBe(0);
  });

  it("argumente greșite: INVALID_ARGS", async () => {
    expect(await call("patch_config", { ops: "nu", reason: "x" })).toMatchObject({ error: { code: "INVALID_ARGS" } });
    expect(await call("patch_config", { ops: [] }, "c2")).toMatchObject({ error: { code: "INVALID_ARGS" } });
    expect(await call("apply_template", { template: "grid", reason: "x" })).toMatchObject({
      error: { code: "INVALID_ARGS" },
    });
    expect(await call("get_ui_snapshot", { moduleId: 3 })).toMatchObject({ error: { code: "INVALID_ARGS" } });
    expect(await call("navigate", null)).toMatchObject({ error: { code: "INVALID_ARGS" } });
  });

  it("apply_template schimbă șablonul și întoarce revizia", async () => {
    expect(await call("apply_template", { template: "simple-tiles", reason: "Plăci mari" })).toEqual({
      ok: true,
      data: { revision: 1 },
    });
    expect(store.getState().config.template).toBe("simple-tiles");
  });

  it("navigate: modul vizibil și home merg; ascuns sau inexistent → ELEMENT_NOT_FOUND", async () => {
    expect(await call("navigate", { moduleId: "messages" }, "n1")).toEqual({ ok: true, data: { route: "messages" } });
    expect(store.getState().route).toBe("messages");
    expect(await call("navigate", { moduleId: "home" }, "n2")).toEqual({ ok: true, data: { route: "home" } });

    store.getState().applyPatch([{ op: "replace", path: "/modules/@feed/visible", value: false }], {
      by: "user",
      reason: "t",
    });
    const hidden = await call("navigate", { moduleId: "feed" }, "n3");
    expect(hidden).toMatchObject({ ok: false, error: { code: "ELEMENT_NOT_FOUND" } });
    expect((hidden as { error: { message: string } }).error.message).toContain("/modules/@feed/visible");
    expect(await call("navigate", { moduleId: "nope" }, "n4")).toMatchObject({ error: { code: "ELEMENT_NOT_FOUND" } });
    expect(store.getState().route).toBe("home");
  });
});

describe("registerTool și robustețea", () => {
  it("unealta altcuiva primește args și ctx (store, registry, runId); data lipsă pleacă drept null", async () => {
    const seen: unknown[] = [];
    bridge.registerTool("say", (args, ctx) => {
      seen.push(args, ctx.runId, ctx.registry.ids(), ctx.store.getState().config.revision);
      return { ok: true, data: undefined as never };
    });
    expect(await call("say", { message: "Salut" })).toEqual({ ok: true, data: null });
    expect(seen).toEqual([{ message: "Salut" }, RUN_ID, ["nav.home", "home.messages"], 0]);
  });

  it("o excepție din handler devine INTERNAL, iar puntea merge mai departe", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    bridge.registerTool("audit_ui", () => {
      throw new Error("bum");
    });
    expect(await call("audit_ui", {})).toMatchObject({
      ok: false,
      error: { code: "INTERNAL", message: expect.stringContaining("bum") },
    });
    expect(await call("get_ui_snapshot", {})).toMatchObject({ ok: true });
  });

  it("un rezultat fără formă devine INTERNAL; un handler async e așteptat", async () => {
    bridge.registerTool("ask_user", () => "da" as never);
    expect(await call("ask_user", { question: "?" })).toMatchObject({ error: { code: "INTERNAL" } });
    bridge.registerTool("wait_for_user_click", async () => ({
      ok: true,
      data: { clickedElementId: "nav.home", correct: true, timedOut: false },
    }));
    expect(await call("wait_for_user_click", { elementId: "nav.home" })).toMatchObject({ ok: true });
  });

  it("a doua înregistrare o înlocuiește pe prima; dezabonarea scoate doar handler-ul ei", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = bridge.registerTool("say", () => ({ ok: true, data: { shown: true } }));
    bridge.registerTool("say", () => ({ ok: false, error: { code: "USER_CANCELLED", message: "a doua" } }));
    expect(warn).toHaveBeenCalledTimes(1);
    first();
    expect(await call("say", { message: "x" })).toMatchObject({ error: { code: "USER_CANCELLED" } });
  });

  it("un abonat care aruncă nu-i oprește pe ceilalți; on() întoarce dezabonarea", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const texts: string[] = [];
    bridge.on("agent_message", () => {
      throw new Error("abonat stricat");
    });
    const off = bridge.on("agent_message", (m) => texts.push(m.text));
    socket.receive({ type: "agent_message", text: "unu", mascot: "happy" });
    off();
    socket.receive({ type: "agent_message", text: "doi", mascot: "happy" });
    expect(texts).toEqual(["unu"]);
  });

  it("send trimite mesajele colegilor; status și onStatus urmăresc socket-ul", () => {
    const statuses: string[] = [];
    bridge.onStatus((s) => statuses.push(s));
    expect(bridge.status()).toBe("open");
    expect(bridge.send({ type: "user_message", text: "Fă textul mai mare", source: "text" })).toBe(true);
    expect(socket.sent.at(-1)).toEqual({ type: "user_message", text: "Fă textul mai mare", source: "text" });
    bridge.stop();
    expect(statuses).toEqual(["closed"]);
    expect(bridge.send({ type: "cancel_run", runId: RUN_ID })).toBe(false);
  });
});
