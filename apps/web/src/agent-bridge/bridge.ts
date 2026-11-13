// Puntea: socket-ul + uneltele web + abonările pe tip de mesaj (specs/04, „Puntea agentului”).
// Un tool_call primește MEREU un tool_result: fără handler → INTERNAL imediat (nu TIMEOUT după 15 s), iar o
// excepție din handler sau dintr-un abonat nu închide socket-ul.

import type { ServerMessage, ToolName, ToolResult } from "@uishapeshifter/contracts";
import type { ConfigStore } from "../ui/config-store";
import type { AgentBridge, AgentRegistry, BridgeStatus, ServerMessageOf, ToolHandler } from "./index";
import { createSocketClient } from "./socket-client";
import type { SocketFactory } from "./socket-client";
import { WEB_TOOLS } from "./web-tools";

export interface StartBridgeOptions {
  url: string;
  userId: string;
  store: ConfigStore;
  registry: AgentRegistry;
  sessionId?: string;
  createSocket?: SocketFactory;
}

type AnyHandler = (message: ServerMessage) => void;
type AnyToolHandler = ToolHandler<ToolName>;

export function startAgentBridge(options: StartBridgeOptions): AgentBridge {
  const tools = new Map<ToolName, AnyToolHandler>(Object.entries(WEB_TOOLS) as [ToolName, AnyToolHandler][]);
  const listeners = new Map<ServerMessage["type"], Set<AnyHandler>>();
  const statusListeners = new Set<(status: BridgeStatus) => void>();

  const client = createSocketClient({
    url: options.url,
    userId: options.userId,
    sessionId: options.sessionId,
    createSocket: options.createSocket,
    onStatus: (status) => statusListeners.forEach((listener) => safely(() => listener(status))),
    onMessage: (message) => {
      if (message.type === "tool_call") void answer(message);
      listeners.get(message.type)?.forEach((listener) => safely(() => listener(message)));
    },
  });

  async function answer(call: ServerMessageOf<"tool_call">): Promise<void> {
    const result = await runTool(call);
    if (!client.send({ type: "tool_result", callId: call.callId, result })) {
      console.warn(`[punte] Rezultatul pentru ${call.name} n-a plecat: socket-ul e închis (serverul va da TIMEOUT).`);
    }
  }

  async function runTool(call: ServerMessageOf<"tool_call">): Promise<ToolResult> {
    const handler = tools.get(call.name);
    if (!handler) {
      return internal(`Unealta ${call.name} nu e încă disponibilă în interfață.`);
    }
    try {
      const result = await handler(call.args, {
        runId: call.runId,
        callId: call.callId,
        store: options.store,
        registry: options.registry,
      });
      return normalize(call.name, result);
    } catch (error) {
      console.error(`[punte] Unealta ${call.name} a aruncat:`, error);
      return internal(`Unealta ${call.name} a avut o eroare în interfață: ${messageOf(error)}`);
    }
  }

  return {
    send: (message) => client.send(message),

    on(type, handler) {
      const set = listeners.get(type) ?? new Set<AnyHandler>();
      listeners.set(type, set);
      const listener = handler as AnyHandler;
      set.add(listener);
      return () => set.delete(listener);
    },

    registerTool(name, handler) {
      if (tools.has(name)) console.warn(`[punte] Unealta ${name} avea deja un handler; îl înlocuiesc.`);
      const registered = handler as unknown as AnyToolHandler;
      tools.set(name, registered);
      return () => {
        if (tools.get(name) === registered) tools.delete(name);
      };
    },

    status: () => client.status(),

    onStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },

    stop: () => client.stop(),
  };
}

/**
 * Serverul acceptă `ok: true` doar cu cheia `data` (A: parseClientMessage); `data: undefined` dispare la JSON și
 * rezultatul s-ar pierde, deci îl trimitem ca `null`. Un rezultat fără formă devine INTERNAL.
 */
function normalize(name: ToolName, result: unknown): ToolResult {
  if (isRecord(result) && result.ok === true) return { ok: true, data: result.data ?? null };
  if (isRecord(result) && result.ok === false && isRecord(result.error) && typeof result.error.code === "string") {
    return result as ToolResult;
  }
  return internal(`Unealta ${name} a întors un rezultat fără formă (ToolResult).`);
}

function internal(message: string): ToolResult<never> {
  return { ok: false, error: { code: "INTERNAL", message } };
}

function safely(run: () => void): void {
  try {
    run();
  } catch (error) {
    console.error("[punte] Un abonat a aruncat:", error);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
