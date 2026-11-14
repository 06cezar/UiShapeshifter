// Mesajele din interiorul extensiei: pagină (content script) ↔ service worker ↔ popup.
// Ce pleacă spre server sunt exact mesajele din packages/contracts (ClientMessage / ServerMessage); aici doar le
// împachetăm ca service worker-ul să știe ce face cu ele. Nu e contract cu serverul, deci nu stă în contracts.

import type { AgentRun, ClientMessage, RunJsData, ServerMessage } from "@uishapeshifter/contracts";
import { isAgentRun } from "../journal/run-api";

/** Numele portului prin care o pagină sau popup-ul vorbește cu service worker-ul. */
export const PAGE_PORT = "uis-page";
export const POPUP_PORT = "uis-popup";

/** Starea legăturii service worker → server. */
export type LinkStatus = "connecting" | "open" | "closed";

/** Ce poate trimite o pagină: mesajele către server (fără hello, pe care îl trimite doar service worker-ul). */
export type OutgoingClientMessage = Exclude<ClientMessage, { type: "hello" }>;

/**
 * „Reia pas cu pas” (panoul, D): pagina nu poate citi rularea direct de pe server (CORS permite doar aplicația web),
 * așa că o cere service worker-ului, care răspunde pe același port cu `run_loaded` și același `requestId`.
 */
export type ToWorker =
  | { type: "to_server"; message: OutgoingClientMessage }
  | { type: "get_status" }
  | { type: "load_run"; requestId: string; runId: string }
  /** Modul expert: codul aprobat de om, rulat de service worker în tab-ul paginii (chrome.userScripts). */
  | { type: "run_js"; requestId: string; code: string };

export type FromWorker =
  | { type: "from_server"; message: ServerMessage }
  | { type: "status"; status: LinkStatus; userId: string | null }
  | { type: "run_loaded"; requestId: string; run?: AgentRun; error?: string }
  | { type: "run_js_done"; requestId: string; data: RunJsData };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const OUTGOING_TYPES: readonly string[] = [
  "user_message",
  "tool_result",
  "signals",
  "suggestion_decision",
  "cancel_run",
];
const SERVER_TYPES: readonly string[] = [
  "run_started",
  "step",
  "tool_call",
  "agent_message",
  "run_finished",
  "suggestion",
  "error",
];

/** Mesajele vin prin porturi și de pe socket: le verificăm forma de bază înainte să le folosim. */
export function parseToWorker(value: unknown): ToWorker | null {
  if (!isRecord(value)) return null;
  if (value.type === "get_status") return { type: "get_status" };
  if (value.type === "run_js") {
    return typeof value.requestId === "string" && typeof value.code === "string"
      ? { type: "run_js", requestId: value.requestId, code: value.code }
      : null;
  }
  if (value.type === "load_run") {
    return typeof value.requestId === "string" && typeof value.runId === "string"
      ? { type: "load_run", requestId: value.requestId, runId: value.runId }
      : null;
  }
  if (value.type !== "to_server" || !isRecord(value.message)) return null;
  const { message } = value;
  if (typeof message.type !== "string" || !OUTGOING_TYPES.includes(message.type)) return null;
  return { type: "to_server", message: message as OutgoingClientMessage };
}

export function parseServerMessage(text: string): ServerMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.type !== "string" || !SERVER_TYPES.includes(value.type)) return null;
  return value as ServerMessage;
}

export function parseFromWorker(value: unknown): FromWorker | null {
  if (!isRecord(value)) return null;
  if (value.type === "status" && typeof value.status === "string") {
    return {
      type: "status",
      status: value.status as LinkStatus,
      userId: typeof value.userId === "string" ? value.userId : null,
    };
  }
  if (value.type === "run_js_done" && typeof value.requestId === "string" && isRecord(value.data)) {
    const { status, result, error } = value.data;
    if (status !== "ran" && status !== "declined" && status !== "disabled") return null;
    return {
      type: "run_js_done",
      requestId: value.requestId,
      data: {
        status,
        ...(typeof result === "string" ? { result } : {}),
        ...(typeof error === "string" ? { error } : {}),
      },
    };
  }
  if (value.type === "run_loaded" && typeof value.requestId === "string") {
    return {
      type: "run_loaded",
      requestId: value.requestId,
      ...(isAgentRun(value.run) ? { run: value.run } : {}),
      ...(typeof value.error === "string" ? { error: value.error } : {}),
    };
  }
  if (value.type === "from_server" && isRecord(value.message) && typeof value.message.type === "string") {
    return { type: "from_server", message: value.message as ServerMessage };
  }
  return null;
}
