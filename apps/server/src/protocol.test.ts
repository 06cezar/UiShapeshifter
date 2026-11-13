// Protocolul cap-coadă (specs/06) cu agentul fals: un client WebSocket adevărat joacă rolul frontend-ului.

import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import {
  DEFAULT_CONFIG,
  type AgentRun,
  type RunListItem,
  type ServerMessage,
  type ToolResult,
  type UISnapshot,
} from "@uishapeshifter/contracts";

const MESSAGE_WAIT_MS = 3000;

let server: Server;
let baseUrl: string;
let wsUrl: string;
let dataDir: string;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "uishapeshifter-test-"));
  process.env.DATA_DIR = dataDir;
  process.env.AGENT_FAKE = "1";
  process.env.AGENT_FAKE_DELAY_MS = "0";
  const { createAppServer } = await import("./server"); // după env, ca modulele să-l vadă
  server = createAppServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
  wsUrl = `ws://localhost:${port}/ws`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
});

/** Frontend-ul de test: ține mesajele primite la coadă și le dă pe rând. */
async function connect(userId = "maria", sessionId = `s-${Math.random()}`) {
  const socket = new WebSocket(wsUrl);
  const inbox: ServerMessage[] = [];
  const waiters: Array<() => void> = [];
  socket.on("message", (data) => {
    inbox.push(JSON.parse(data.toString()) as ServerMessage);
    waiters.splice(0).forEach((wake) => wake());
  });
  await new Promise((resolve, reject) => socket.once("open", resolve).once("error", reject));

  async function next<T extends ServerMessage["type"]>(type: T): Promise<Extract<ServerMessage, { type: T }>> {
    const deadline = Date.now() + MESSAGE_WAIT_MS;
    for (;;) {
      const index = inbox.findIndex((message) => message.type === type);
      if (index >= 0) return inbox.splice(index, 1)[0] as Extract<ServerMessage, { type: T }>;
      if (Date.now() > deadline) throw new Error(`n-a venit ${type}; am primit: ${JSON.stringify(inbox)}`);
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  }
  const send = (message: unknown) => socket.send(JSON.stringify(message));
  const hello = () => send({ type: "hello", userId, sessionId });
  return { socket, inbox, next, send, hello, sessionId };
}

const snapshot: UISnapshot = {
  route: "home",
  configRevision: 0,
  viewport: { width: 400, height: 800 },
  openOverlays: [],
  takenAt: new Date().toISOString(),
  elements: [
    {
      id: "nav.messages",
      role: "button",
      label: "Mesaje",
      rect: { x: 0, y: 740, width: 80, height: 60 },
      visible: true,
      inViewport: true,
      interactive: true,
      fontPx: 16,
    },
  ],
};

async function getJson<T>(path: string): Promise<{ status: number; body: T }> {
  const response = await fetch(baseUrl + path);
  return { status: response.status, body: (await response.json()) as T };
}

describe("WebSocket cu agentul fals", () => {
  it("„fă textul mai mare”: snapshot → patch → point_at → finish, cu pașii în jurnal", async () => {
    const web = await connect();
    web.hello();
    web.send({ type: "user_message", text: "Fă textul mai mare", source: "text" });

    const started = await web.next("run_started");
    expect(started.origin).toBe("user");

    const answers: Record<string, ToolResult> = {
      get_ui_snapshot: { ok: true, data: snapshot },
      patch_config: { ok: true, data: { revision: 1, applied: 1 } },
      point_at: { ok: true, data: { scrolledIntoView: false, rect: snapshot.elements[0].rect } },
    };
    const calls: string[] = [];
    for (const name of ["get_ui_snapshot", "patch_config", "point_at"]) {
      const call = await web.next("tool_call");
      expect(call.name).toBe(name);
      expect(call.runId).toBe(started.runId);
      calls.push(call.name);
      if (name === "patch_config") {
        expect(call.args).toMatchObject({ ops: [{ op: "replace", path: "/theme/baseFontPx", value: 18 }] });
      }
      if (name === "point_at") expect(call.args).toMatchObject({ elementId: "nav.messages" });
      web.send({ type: "tool_result", callId: call.callId, result: answers[name] });
      const step = await web.next("step");
      expect(step.step.tool).toBe(name);
      expect(step.step.observation).not.toBe("");
    }
    const finishStep = await web.next("step");
    expect(finishStep.step.tool).toBe("finish");
    expect((await web.next("agent_message")).mascot).toBe("happy");
    const finished = await web.next("run_finished");
    expect(finished).toMatchObject({ runId: started.runId, success: true });
    expect(calls).toEqual(["get_ui_snapshot", "patch_config", "point_at"]);

    const { status, body: run } = await getJson<AgentRun>(`/api/runs/${started.runId}`);
    expect(status).toBe(200);
    expect(run.status).toBe("succeeded");
    expect(run.model).toBe("fake");
    expect(run.steps.map((step) => step.tool)).toEqual(["get_ui_snapshot", "patch_config", "point_at", "finish"]);
    expect(run.steps[1]).toMatchObject({ configRevisionBefore: 0, configRevisionAfter: 1 });

    const list = await getJson<RunListItem[]>("/api/runs?userId=maria");
    expect(list.body.map((item) => item.runId)).toContain(started.runId);
    web.socket.close();
  });

  it("cere hello înainte de orice", async () => {
    const web = await connect();
    web.send({ type: "user_message", text: "salut", source: "text" });
    expect((await web.next("error")).message).toMatch(/hello/);
    web.socket.close();
  });

  it("închide socket-ul fără hello în 5 s", async () => {
    const web = await connect();
    const code = await new Promise<number>((resolve) => web.socket.once("close", resolve));
    expect(code).toBe(4000);
  }, 8000);

  it("cancel_run oprește rularea și trimite run_finished { success: false }", async () => {
    const web = await connect();
    web.hello();
    web.send({ type: "user_message", text: "Fă textul mai mare", source: "text" });
    const started = await web.next("run_started");
    await web.next("tool_call"); // nu răspundem: rularea stă în unealtă
    web.send({ type: "cancel_run", runId: started.runId });
    expect(await web.next("run_finished")).toMatchObject({ runId: started.runId, success: false });
    const { body: run } = await getJson<AgentRun>(`/api/runs/${started.runId}`);
    expect(run.status).toBe("cancelled");
    web.socket.close();
  });

  it("o unealtă în zbor la deconectare devine TIMEOUT; după reconectare rularea continuă", async () => {
    const first = await connect("maria", "tab-reconectare");
    first.hello();
    first.send({ type: "user_message", text: "Fă textul mai mare", source: "text" });
    const started = await first.next("run_started");
    await first.next("tool_call");
    first.socket.close(); // tab-ul pierde conexiunea în mijlocul unei unelte

    const second = await connect("maria", "tab-reconectare");
    second.hello();
    // rularea merge mai departe pe socket-ul nou: următoarea unealtă ajunge aici
    const call = await second.next("tool_call");
    expect(call.runId).toBe(started.runId);
    expect(call.name).toBe("patch_config");
    second.send({ type: "cancel_run", runId: started.runId });
    await second.next("run_finished");

    const { body: run } = await getJson<AgentRun>(`/api/runs/${started.runId}`);
    expect(run.steps[0].result).toMatchObject({ ok: false, error: { code: "TIMEOUT" } });
    second.socket.close();
  });

  it("o rulare nouă a aceluiași utilizator o oprește pe cea veche", async () => {
    const web = await connect("ana");
    web.hello();
    web.send({ type: "user_message", text: "Fă textul mai mare", source: "text" });
    const first = await web.next("run_started");
    await web.next("tool_call");
    web.send({ type: "user_message", text: "Altceva", source: "text" });
    const second = await web.next("run_started");
    expect(second.runId).not.toBe(first.runId);
    expect(await web.next("run_finished")).toMatchObject({ runId: first.runId, success: false });
    web.socket.close();
  });
});

describe("HTTP", () => {
  it("GET /api/runs/:runId necunoscut → 404, fără userId → 400", async () => {
    expect((await getJson("/api/runs/run-nu-exista")).status).toBe(404);
    expect((await getJson("/api/runs/..%2F..%2Fetc")).status).toBe(404);
    expect((await getJson("/api/runs")).status).toBe(400);
  });

  it("GET/PUT /api/config/:userId: implicit, apoi ce s-a salvat", async () => {
    const initial = await getJson<typeof DEFAULT_CONFIG>("/api/config/demo-fresh");
    expect(initial.body).toEqual(DEFAULT_CONFIG);

    const changed = { ...DEFAULT_CONFIG, revision: 3, theme: { ...DEFAULT_CONFIG.theme, baseFontPx: 20 } };
    const put = await fetch(`${baseUrl}/api/config/demo-fresh`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changed),
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ revision: 3 });
    expect((await getJson("/api/config/demo-fresh")).body).toEqual(changed);
  });

  it("PUT /api/config cu un corp greșit → 400", async () => {
    const put = await fetch(`${baseUrl}/api/config/maria`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: "nu" }),
    });
    expect(put.status).toBe(400);
    expect(((await put.json()) as { error: string }).error).toBeTruthy();
  });
});
