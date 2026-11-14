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
 * Al doilea strat, după plasa lui C (care caută cuvinte în text și poate fi ocolită, ex. `window["fe" + "tch"]`):
 * înainte de cod, în lumea USER_SCRIPT (izolată: pagina nu e atinsă), scoatem ușile prin care datele omului ar putea
 * pleca — rețeaua, cookie-urile, stocarea, ferestrele noi, trimiterea formularelor și schimbarea adreselor (src, href,
 * action). Citirea lor rămâne. Nu e o garanție completă (ex. HTML cu imagini prin innerHTML); garanția e omul.
 */
const LOCKDOWN = `(() => {
  const deny = (name) => () => { throw new Error(name + " nu e permis în modul expert"); };
  const lock = (target, name) => {
    try { Object.defineProperty(target, name, { get: deny(name), set: deny(name), configurable: true }); } catch {}
  };
  const lockWrite = (proto, name) => {
    const d = proto && Object.getOwnPropertyDescriptor(proto, name);
    if (!d) return;
    try { Object.defineProperty(proto, name, { get: d.get, set: deny(name), configurable: true }); } catch {}
  };
  for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "Image", "Worker", "SharedWorker",
    "open", "localStorage", "sessionStorage", "indexedDB", "caches", "RTCPeerConnection"]) lock(globalThis, name);
  lock(navigator, "sendBeacon"); lock(navigator, "serviceWorker");
  lock(Document.prototype, "cookie"); lock(document, "cookie");
  for (const [type, name] of [["HTMLImageElement", "src"], ["HTMLImageElement", "srcset"], ["HTMLScriptElement", "src"],
    ["HTMLIFrameElement", "src"], ["HTMLLinkElement", "href"], ["HTMLAnchorElement", "href"], ["HTMLFormElement", "action"],
    ["HTMLSourceElement", "src"], ["HTMLMediaElement", "src"]]) lockWrite(globalThis[type]?.prototype, name);
  if (globalThis.HTMLFormElement) {
    HTMLFormElement.prototype.submit = deny("submit");
    HTMLFormElement.prototype.requestSubmit = deny("requestSubmit");
  }
  const setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (/^(src|srcset|href|action|formaction)$/i.test(String(name))) throw new Error(name + " nu e permis în modul expert");
    return setAttribute.call(this, name, value);
  };
})();`;

/**
 * Codul agentului într-o funcție async: `return` și `await` merg, iar rezultatul (și o promisiune) ajunge înapoi.
 * Eroarea o prindem aici, ca să ajungă la agent ca text, nu ca excepție pierdută. Înainte rulează LOCKDOWN.
 */
export function wrapCode(code: string): string {
  return `${LOCKDOWN}\n(async () => {\ntry {\n${code}\n} catch (e) { return { __runJsError: String(e && e.message || e) }; }\n})()`;
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
