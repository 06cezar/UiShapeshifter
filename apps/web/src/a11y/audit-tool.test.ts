import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "@uishapeshifter/contracts";
import type { ElementInfo, ToolResult, AuditReport, UISnapshot, UserNeeds } from "@uishapeshifter/contracts";
import type { AgentRegistry, ToolContext } from "../agent-bridge";
import { startAgentBridge } from "../agent-bridge/bridge";
import { fakeSocketFactory } from "../agent-bridge/test-socket";
import { createAppConfigStore } from "../ui/a11y-binding";
import { createRegistry } from "../ui/registry";
import { auditUiHandler, parseAuditArgs, registerAuditTool } from "./audit-tool";
import { mergeFixes } from "./fixes";

const MARIA: UserNeeds = { minFontPx: 20, contrast: "high", minTargetPx: 56, reducedMotion: false, prefersVoice: true };
const palette = DEFAULT_CONFIG.theme.palette;

/** Interfața implicită (16px, ținte de 44px, butonul portocaliu), așa cum o măsoară registrul. */
function snapshotOf(revision: number): UISnapshot {
  const base: Omit<ElementInfo, "id"> = {
    role: "text",
    label: "Ana: Ce faci, bunico?",
    moduleId: "messages",
    rect: { x: 10, y: 10, width: 200, height: 56 },
    visible: true,
    inViewport: true,
    interactive: false,
    fontPx: 16,
    fontWeight: 400,
    color: palette.text,
    background: palette.background,
  };
  return {
    route: "messages",
    configRevision: revision,
    viewport: { width: 400, height: 800 },
    openOverlays: [],
    takenAt: "2026-11-13T20:00:00.000Z",
    elements: [
      { ...base, id: "chat.ana.msg" },
      {
        ...base,
        id: "messages.send",
        role: "button",
        label: "Trimite",
        interactive: true,
        rect: { x: 10, y: 100, width: 120, height: 44 },
        color: palette.onPrimary,
        background: palette.primary,
      },
    ],
  };
}

function context(): ToolContext & { snapshotCalls: unknown[] } {
  // Config-ul pornește ca DEFAULT_CONFIG (nu ajustat după profil), ca auditul să aibă ce găsi.
  const store = createAppConfigStore(MARIA, structuredClone(DEFAULT_CONFIG));
  const snapshotCalls: unknown[] = [];
  const registry = {
    snapshot: (opts?: unknown) => {
      snapshotCalls.push(opts);
      return snapshotOf(store.getState().config.revision);
    },
  } as unknown as AgentRegistry;
  return { runId: "run-1", callId: "call-1", store, registry, snapshotCalls };
}

async function run(args: unknown, ctx = context()): Promise<ToolResult<AuditReport>> {
  return auditUiHandler(args, ctx);
}

describe("argumentele", () => {
  it("acceptă {}, lipsa lor sau { moduleId }", () => {
    expect(parseAuditArgs(undefined)).toEqual({});
    expect(parseAuditArgs({})).toEqual({});
    expect(parseAuditArgs({ moduleId: "messages" })).toEqual({ moduleId: "messages" });
  });
  it("refuză ce nu se potrivește", () => {
    expect(parseAuditArgs({ moduleId: 3 })).toBeUndefined();
    expect(parseAuditArgs({ moduleId: "" })).toBeUndefined();
    expect(parseAuditArgs({ module: "messages" })).toBeUndefined();
    expect(parseAuditArgs("messages")).toBeUndefined();
  });
  it("argumente greșite → INVALID_ARGS, cu un exemplu pentru model", async () => {
    const result = await run({ module: "messages" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ARGS");
      expect(result.error.message).toContain("moduleId");
    }
  });
});

describe("audit_ui", () => {
  it("cere registrului snapshot-ul modulului cerut", async () => {
    const ctx = context();
    await run({ moduleId: "messages" }, ctx);
    expect(ctx.snapshotCalls).toEqual([{ moduleId: "messages" }]);
  });

  it("judecă cu pragurile utilizatorului din store și pune reparațiile", async () => {
    const result = await run({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.thresholds).toMatchObject({ minFontPx: 20, minTargetPx: 56, minContrastText: 7 });
    expect(result.data.ok).toBe(false);
    expect(result.data.issues.every((i) => i.fix && i.fix.length > 0)).toBe(true);
  });

  it("cap-coadă: reparațiile se aplică prin store (ca patch_config), iar auditul următor e curat", async () => {
    const ctx = context();
    const first = await run({}, ctx);
    if (!first.ok) throw new Error("auditul a eșuat");

    const applied = ctx.store.getState().applyPatch(mergeFixes(first.data.issues), {
      by: "agent",
      reason: "Reparațiile din audit",
      runId: ctx.runId,
    });
    expect(applied.ok).toBe(true);

    // Registrul real ar măsura interfața randată din config-ul nou: o simulăm din config.
    const { config } = ctx.store.getState();
    const after = snapshotOf(config.revision);
    for (const el of after.elements) {
      el.fontPx = config.theme.baseFontPx;
      if (el.interactive) {
        el.rect.height = config.minTargetPx;
        el.background = config.theme.palette.primary;
      }
    }
    const second = await run({}, { ...ctx, registry: { snapshot: () => after } as unknown as AgentRegistry });
    expect(second.ok && second.data).toMatchObject({ ok: true, score: 100, configRevision: config.revision });
  });

  it("registerAuditTool înregistrează unealta sub numele audit_ui", () => {
    const unregister = vi.fn();
    const bridge = { registerTool: vi.fn(() => unregister) };
    expect(registerAuditTool(bridge)).toBe(unregister);
    expect(bridge.registerTool).toHaveBeenCalledWith("audit_ui", auditUiHandler);
  });
});

describe("audit_ui prin WebSocket (C2: „Gata” din tasks.yaml)", () => {
  it("un tool_call audit_ui de la server primește un tool_result cu AuditReport și reparații", async () => {
    const root = document.createElement("div");
    root.innerHTML = `<section data-module-id="messages"><button data-agent-id="messages.send">Trimite</button></section>`;
    document.body.appendChild(root);
    // happy-dom nu face layout: butonul are mărimea implicită a temei (44px), sub pragul de 56px al Mariei.
    for (const el of root.querySelectorAll<HTMLElement>("[data-agent-id]")) {
      el.getBoundingClientRect = () => new DOMRect(10, 10, 120, 44);
    }
    const store = createAppConfigStore(MARIA, structuredClone(DEFAULT_CONFIG));
    const createSocket = fakeSocketFactory();
    const bridge = startAgentBridge({
      url: "ws://server/ws",
      userId: "maria",
      sessionId: "tab-1",
      store,
      registry: createRegistry(store, root),
      createSocket,
    });
    const unregister = registerAuditTool(bridge);
    const socket = createSocket.last();
    socket.open();

    socket.receive({ type: "tool_call", runId: "run-1", callId: "c-audit", name: "audit_ui", args: {} });
    const reply = await vi.waitFor(() => {
      const message = socket.sent.find((m) => (m as { callId?: string }).callId === "c-audit");
      expect(message).toBeDefined();
      return message as { type: string; result: ToolResult<AuditReport> };
    });

    expect(reply.type).toBe("tool_result");
    expect(reply.result.ok).toBe(true);
    if (!reply.result.ok) return;
    const report = reply.result.data;
    expect(report.configRevision).toBe(store.getState().config.revision);
    const tooSmall = report.issues.find((issue) => issue.rule === "target-size" && issue.elementId === "messages.send");
    expect(tooSmall?.fix?.length ?? 0).toBeGreaterThan(0);

    unregister();
    bridge.stop();
    root.remove();
  });
});
