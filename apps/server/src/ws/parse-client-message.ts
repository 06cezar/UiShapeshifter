// Mesajele de la frontend vin din afară: le verificăm forma înainte să le folosim (ClientMessage, specs/06).

import type { ClientMessage, PageInfo, ToolResult, UsageSignal } from "@uishapeshifter/contracts";

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// host ajunge în calea fișierelor de rețete (data/recipes): fără „www.”, litere mici (specs/06). Etichete despărțite de
// câte un punct, fără „.”, „..” sau puncte la capete, ca un host să nu poată fi niciodată o cale.
const HOST_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;
const MAX_HOST_CHARS = 253;

/** `page` lipsește pe pagina de probă; dacă vine, trebuie să aibă forma PageInfo. undefined = lipsă, null = stricat. */
function parsePage(value: unknown): PageInfo | undefined | null {
  if (value === undefined) return undefined;
  if (!isObject(value)) return null;
  const { url, host, title } = value;
  if (typeof url !== "string" || typeof host !== "string" || typeof title !== "string") return null;
  return host.length <= MAX_HOST_CHARS && HOST_PATTERN.test(host) ? { url, host, title } : null;
}

/**
 * Un `page` stricat nu refuză mesajul: îl scoatem și mesajul merge mai departe fără el. Service worker-ul leagă
 * fiecare user_message de primul run_started care vine (în ordine); un mesaj refuzat, fără run_started, ar muta
 * rulările următoare în alt tab.
 */
function pageOrDrop(value: unknown): PageInfo | undefined {
  const page = parsePage(value);
  if (page === null) console.warn("ws: page stricat (host invalid sau formă greșită), mesajul merge fără el");
  return page ?? undefined;
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
    case "user_message": {
      if (!isNonEmptyString(message.text) || (message.source !== "text" && message.source !== "voice")) return null;
      const page = pageOrDrop(message.page);
      return { type: "user_message", text: message.text.trim(), source: message.source, ...(page && { page }) };
    }
    case "tool_result":
      return isNonEmptyString(message.callId) && isToolResult(message.result)
        ? { type: "tool_result", callId: message.callId, result: message.result }
        : null;
    case "signals": {
      // conținutul fiecărui semnal îl verifică adaptarea (E); aici doar că e o listă de obiecte cu `kind`
      const valid =
        Array.isArray(message.signals) && message.signals.every((s) => isObject(s) && typeof s.kind === "string");
      if (!valid) return null;
      const page = pageOrDrop(message.page);
      return { type: "signals", signals: message.signals as UsageSignal[], ...(page && { page }) };
    }
    case "suggestion_decision":
      return isNonEmptyString(message.suggestionId) && (message.decision === "accept" || message.decision === "dismiss")
        ? { type: "suggestion_decision", suggestionId: message.suggestionId, decision: message.decision }
        : null;
    case "cancel_run":
      return isNonEmptyString(message.runId) ? { type: "cancel_run", runId: message.runId } : null;
    default:
      return null;
  }
}
