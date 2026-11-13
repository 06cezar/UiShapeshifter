// Mesajele de la frontend vin din afară: le verificăm forma înainte să le folosim (ClientMessage, specs/06).

import type { ClientMessage, ToolResult, UsageSignal } from "@uishapeshifter/contracts";

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isToolResult(value: unknown): value is ToolResult {
  if (!isObject(value)) return false;
  if (value.ok === true) return "data" in value;
  return value.ok === false && isObject(value.error) && typeof value.error.code === "string";
}

export function parseClientMessage(raw: string): ClientMessage | null {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(message)) return null;

  switch (message.type) {
    case "hello":
      return isNonEmptyString(message.userId) && isNonEmptyString(message.sessionId)
        ? { type: "hello", userId: message.userId, sessionId: message.sessionId }
        : null;
    case "user_message":
      return isNonEmptyString(message.text) && (message.source === "text" || message.source === "voice")
        ? { type: "user_message", text: message.text.trim(), source: message.source }
        : null;
    case "tool_result":
      return isNonEmptyString(message.callId) && isToolResult(message.result)
        ? { type: "tool_result", callId: message.callId, result: message.result }
        : null;
    case "signals":
      // conținutul fiecărui semnal îl verifică adaptarea (E); aici doar că e o listă de obiecte cu `kind`
      return Array.isArray(message.signals) && message.signals.every((s) => isObject(s) && typeof s.kind === "string")
        ? { type: "signals", signals: message.signals as UsageSignal[] }
        : null;
    case "cancel_run":
      return isNonEmptyString(message.runId) ? { type: "cancel_run", runId: message.runId } : null;
    default:
      return null;
  }
}
