// Modul expert (experiment, specs/05 „run_js”, doar pe branch-ul x-mod-js): singurul loc în care extensia rulează cod
// JavaScript scris de agent. Oprit implicit; omul îl pornește din popup și, în Chrome, „Allow User Scripts” în
// detaliile extensiei. Codul ajunge aici doar după verificarea și aprobarea din pagină (C: omul vede codul și apasă
// „Rulează”) și rulează o singură dată, în lumea USER_SCRIPT (izolată de JavaScript-ul site-ului), prin
// chrome.userScripts.execute din service worker. Nu intră în rețetă și nu se reaplică.

import { RUN_JS_LIMITS, type RunJsData } from "@uishapeshifter/contracts";

/** Cheia din chrome.storage.local: true doar după ce omul a pornit modul din popup. */
export const EXPERT_MODE_KEY = "expertMode";

export interface ExpertStorage {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export async function isExpertMode(storage: ExpertStorage): Promise<boolean> {
  return (await storage.get(EXPERT_MODE_KEY))[EXPERT_MODE_KEY] === true;
}

export async function setExpertMode(storage: ExpertStorage, on: boolean): Promise<void> {
  await storage.set({ [EXPERT_MODE_KEY]: on });
}

/**
 * Codul agentului într-o funcție async: `return` și `await` merg, iar rezultatul (și o promisiune) ajunge înapoi.
 * Eroarea o prindem aici, ca să ajungă la agent ca text, nu ca excepție pierdută.
 */
export function wrapCode(code: string): string {
  return `(async () => {\ntry {\n${code}\n} catch (e) { return { __runJsError: String(e && e.message || e) }; }\n})()`;
}

function clip(text: string): string {
  return text.length > RUN_JS_LIMITS.maxResultChars ? `${text.slice(0, RUN_JS_LIMITS.maxResultChars)}…` : text;
}

/** Ce a întors scriptul (sau eroarea lui) → RunJsData pentru agent, cu textul tăiat la limită. */
export function runJsDataFrom(result: unknown, injectionError?: string): RunJsData {
  if (injectionError) return { status: "ran", error: clip(injectionError) };
  if (typeof result === "object" && result !== null && "__runJsError" in result) {
    return { status: "ran", error: clip(String((result as { __runJsError: unknown }).__runJsError)) };
  }
  if (result === undefined) return { status: "ran" };
  let text: string;
  try {
    text = typeof result === "string" ? result : JSON.stringify(result);
  } catch {
    text = String(result);
  }
  return { status: "ran", result: clip(text ?? String(result)) };
}
