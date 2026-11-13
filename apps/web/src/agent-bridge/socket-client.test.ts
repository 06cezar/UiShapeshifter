import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@uishapeshifter/contracts";
import { parseServerMessage } from "./server-message";
import { createSocketClient, RECONNECT_DELAYS_MS } from "./socket-client";
import { fakeSocketFactory } from "./test-socket";

const URL = "ws://server/ws";

function setup() {
  const createSocket = fakeSocketFactory();
  const received: ServerMessage[] = [];
  const statuses: string[] = [];
  const client = createSocketClient({
    url: URL,
    userId: "maria",
    sessionId: "tab-1",
    onMessage: (m) => received.push(m),
    onStatus: (s) => statuses.push(s),
    createSocket,
  });
  return { client, createSocket, received, statuses };
}

describe("createSocketClient", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("la deschidere trimite hello cu userId și sessionId", () => {
    const { client, createSocket, statuses } = setup();
    expect(client.status()).toBe("connecting");
    createSocket.last().open();
    expect(createSocket.last().url).toBe(URL);
    expect(createSocket.last().sent).toEqual([{ type: "hello", userId: "maria", sessionId: "tab-1" }]);
    expect(statuses).toEqual(["open"]);
  });

  it("send merge doar cu socket-ul deschis (fără coadă)", () => {
    const { client, createSocket } = setup();
    const message = { type: "cancel_run", runId: "r1" } as const;
    expect(client.send(message)).toBe(false);
    createSocket.last().open();
    expect(client.send(message)).toBe(true);
    expect(createSocket.last().sent.at(-1)).toEqual(message);
  });

  it("se reconectează la 1 s, 2 s, 5 s, apoi la 5 s, cu același sessionId", async () => {
    const { createSocket, statuses } = setup();
    const waits = [...RECONNECT_DELAYS_MS, RECONNECT_DELAYS_MS[2]];
    for (const [i, delay] of waits.entries()) {
      createSocket.last().drop();
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(createSocket.sockets).toHaveLength(i + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(createSocket.sockets).toHaveLength(i + 2);
    }
    createSocket.last().open();
    expect(createSocket.last().sent).toEqual([{ type: "hello", userId: "maria", sessionId: "tab-1" }]);
    expect(statuses.at(-1)).toBe("open");
  });

  it("după o conectare reușită, pauzele o iau de la 1 s", async () => {
    const { createSocket } = setup();
    createSocket.last().drop();
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[0]);
    createSocket.last().drop();
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[1]);
    createSocket.last().open();
    createSocket.last().drop();
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[0]);
    expect(createSocket.sockets).toHaveLength(4);
  });

  it("stop închide și nu se mai reconectează", async () => {
    const { client, createSocket, statuses } = setup();
    createSocket.last().open();
    client.stop();
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS_MS[2] * 3);
    expect(createSocket.sockets).toHaveLength(1);
    expect(statuses.at(-1)).toBe("closed");
  });

  it("mesajele valide ajung la onMessage, cele invalide se ignoră cu avertisment", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createSocket, received } = setup();
    createSocket.last().open();
    createSocket.last().receive({ type: "run_started", runId: "r1", goal: "Fă textul mai mare", origin: "user" });
    createSocket.last().receive("nu e json");
    createSocket.last().receive({ type: "tool_call", runId: "r1", callId: "c1", name: "rm_rf" });
    expect(received).toEqual([{ type: "run_started", runId: "r1", goal: "Fă textul mai mare", origin: "user" }]);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe("parseServerMessage", () => {
  const ok = (m: unknown) => parseServerMessage(JSON.stringify(m));

  it("acceptă fiecare tip din ServerMessage", () => {
    expect(ok({ type: "tool_call", runId: "r", callId: "c", name: "patch_config", args: { ops: [] } })).toMatchObject({
      name: "patch_config",
      args: { ops: [] },
    });
    expect(ok({ type: "step", step: { runId: "r", index: 0, tool: "say" } })).toMatchObject({ type: "step" });
    expect(ok({ type: "agent_message", text: "Salut", mascot: "happy" })).toMatchObject({ mascot: "happy" });
    expect(ok({ type: "run_finished", runId: "r", success: true, summary: "Gata" })).toMatchObject({ success: true });
    expect(ok({ type: "error", message: "x" })).toEqual({ type: "error", message: "x" });
  });

  it("respinge formele greșite", () => {
    expect(ok({ type: "run_started", runId: "r", goal: "g", origin: "robot" })).toBeNull();
    expect(ok({ type: "agent_message", text: "x", mascot: "dancing" })).toBeNull();
    expect(ok({ type: "run_finished", runId: "r", success: "da", summary: "" })).toBeNull();
    expect(ok({ type: "step", step: null })).toBeNull();
    expect(ok({ type: "necunoscut" })).toBeNull();
    expect(ok([1, 2])).toBeNull();
  });
});
