// Semnalele de utilizare (E2, specs/09): cum folosește omul pagina, ca adaptarea (E3) să observe singură unde se
// chinuie. Doar poziții, id-uri din registru și momente; niciodată textul din câmpuri sau parole.
//
//   misclick       click care nu lovește nimic interactiv, la ≤ 24px de un element interactiv
//   feature_use    click pe un element interactiv (id din registru + acțiunea)
//   zoom           ctrl + rotiță / ctrl + „+” / pinch: scara față de începutul vizitei
//   dwell          ≥ 20 s în aceeași zonă fără niciun click
//   back_loop      aceeași pagină deschisă de ≥ 3 ori în 60 s
//   help_request   „ajutor” în chat (îl anunță content script-ul)
//
// Pleacă în loturi, cel mult o dată la 5 s, prin `flush`.

import type { UsageSignal } from "@uishapeshifter/contracts";

/** Un click la cel mult atâția px de un element interactiv e o țintă ratată (specs/09). */
export const MISCLICK_RADIUS_PX = 24;
/** Cât timp fără click într-o zonă înseamnă „stă și nu știe ce să facă” (specs/09). */
export const DWELL_MS = 20_000;
/** Cât de des verificăm dacă omul stă pe loc. */
const DWELL_CHECK_MS = 5_000;
/** De câte ori aceeași pagină într-o fereastră de timp e o buclă (specs/09). */
export const BACK_LOOP_COUNT = 3;
export const BACK_LOOP_WINDOW_MS = 60_000;
/** O schimbare de scară mai mică de atât e zgomot (rotunjiri), nu zoom. */
const ZOOM_MIN_CHANGE = 0.05;
/** Zoom-ul se citește după ce browserul l-a aplicat. */
const ZOOM_SETTLE_MS = 400;
/** Lotul se trimite cel mult o dată la atât (specs/06, `signals`). */
export const FLUSH_EVERY_MS = 5_000;
/** Peste atâtea semnale în așteptare, cele mai vechi se aruncă (o pagină care primește mii de click-uri). */
const MAX_QUEUED = 200;

/** Ce e interactiv pentru om: ce se poate apăsa sau completa. */
const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "summary",
  "label",
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="option"]',
  "[onclick]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Cuvinte din chat care cer ajutor. */
const HELP_WORDS = /\b(ajutor|ajut[aă]-m[aă]|nu (m[aă] )?descurc|nu (g[aă]sesc|[sș]tiu)|help)\b/i;

export function isHelpRequest(text: string): boolean {
  return HELP_WORDS.test(text);
}

export interface SignalCollectorOptions {
  doc?: Document;
  win?: Window;
  /** Gazda interfeței noastre (HOST_ID): click-urile pe chat, mascotă, panou nu sunt semnale despre site. */
  ourHostId: string;
  idOf(element: Element): string;
  regionIdOf(element: Element): string | undefined;
  /** Trimite un lot (content script → service worker → server). */
  send(signals: UsageSignal[]): void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Scara paginii acum (zoom-ul browserului × pinch); injectabilă pentru teste. */
  scale?: () => number;
}

export interface SignalCollector {
  /** Omul a cerut ajutor (din chat). */
  helpRequest(text?: string): void;
  /** Păstrez / Anulez pe o propunere (panoul de control). */
  proposalDecision(proposalId: string, decision: "keep" | "undo"): void;
  /** Trimite acum ce e în așteptare (ex. la închiderea paginii). */
  flush(): void;
  stop(): void;
}

function distanceToRect(x: number, y: number, rect: DOMRect): number {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);
  return Math.hypot(dx, dy);
}

export function startSignalCollector(options: SignalCollectorOptions): SignalCollector {
  const doc = options.doc ?? document;
  const win = options.win ?? window;
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as number));
  const scale = options.scale ?? (() => win.devicePixelRatio * (win.visualViewport?.scale ?? 1));

  const queue: UsageSignal[] = [];
  const timers = new Set<unknown>();
  let stopped = false;

  const ts = () => new Date(now()).toISOString();
  function push(signal: UsageSignal) {
    if (stopped) return;
    queue.push(signal);
    if (queue.length > MAX_QUEUED) queue.splice(0, queue.length - MAX_QUEUED);
  }
  function every(ms: number, fn: () => void) {
    const tick = () => {
      if (stopped) return;
      fn();
      timers.add(setTimer(tick, ms));
    };
    timers.add(setTimer(tick, ms));
  }

  function flush() {
    if (queue.length === 0) return;
    options.send(queue.splice(0));
  }

  const isOurs = (target: EventTarget | null) =>
    target instanceof Element && target.closest(`#${CSS.escape(options.ourHostId)}`) !== null;

  // ---------- click: feature_use sau misclick ----------
  let lastClickAt = now();
  let lastRegion: string | undefined;

  function nearestInteractive(x: number, y: number): { element: Element; distance: number } | undefined {
    let best: { element: Element; distance: number } | undefined;
    for (const element of doc.querySelectorAll(INTERACTIVE_SELECTOR)) {
      if (isOurs(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const distance = distanceToRect(x, y, rect);
      if (distance <= MISCLICK_RADIUS_PX && (!best || distance < best.distance)) best = { element, distance };
    }
    return best;
  }

  function onClick(event: MouseEvent) {
    if (isOurs(event.target)) return;
    lastClickAt = now();
    const target = event.target instanceof Element ? event.target : null;
    if (target) lastRegion = options.regionIdOf(target) ?? lastRegion;
    const hit = target?.closest(INTERACTIVE_SELECTOR);
    if (hit) {
      push({
        kind: "feature_use",
        ts: ts(),
        elementId: options.idOf(hit),
        action: hit.getAttribute("role") ?? hit.tagName.toLowerCase(),
      });
      return;
    }
    const near = nearestInteractive(event.clientX, event.clientY);
    if (!near) return; // click pe text sau pe spațiu gol, departe de orice buton: nu e o ratare
    push({
      kind: "misclick",
      ts: ts(),
      x: Math.round(event.clientX),
      y: Math.round(event.clientY),
      nearestElementId: options.idOf(near.element),
      distancePx: Math.round(near.distance),
    });
  }

  // ---------- zoom ----------
  const baseScale = scale();
  let lastScale = baseScale;
  let zoomTimer: unknown = null;
  function checkZoom() {
    zoomTimer = null;
    const current = scale() / baseScale;
    if (Math.abs(current - lastScale / baseScale) < ZOOM_MIN_CHANGE) return;
    lastScale = scale();
    push({ kind: "zoom", ts: ts(), scale: Math.round(current * 100) / 100 });
  }
  function zoomSoon() {
    if (zoomTimer !== null) clearTimer(zoomTimer);
    zoomTimer = setTimer(checkZoom, ZOOM_SETTLE_MS);
  }
  function onWheel(event: WheelEvent) {
    if (event.ctrlKey) zoomSoon();
  }
  function onKey(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && ["+", "=", "-", "0"].includes(event.key)) zoomSoon();
  }

  // ---------- dwell ----------
  let dwellReported = false;
  function checkDwell() {
    if (doc.visibilityState === "hidden") return;
    const idle = now() - lastClickAt;
    if (idle < DWELL_MS) {
      dwellReported = false;
      return;
    }
    if (dwellReported) return; // o singură dată pe perioadă de stat pe loc
    dwellReported = true;
    const center = doc.elementFromPoint?.(win.innerWidth / 2, win.innerHeight / 2);
    const moduleId = (center && options.regionIdOf(center)) ?? lastRegion ?? win.location.pathname;
    push({ kind: "dwell", ts: ts(), moduleId, ms: idle });
  }

  // ---------- back_loop: aceeași pagină de ≥ 3 ori în 60 s (și în aplicațiile de o pagină) ----------
  const visits = new Map<string, number[]>();
  let lastPath = "";
  function notePath() {
    const path = win.location.pathname + win.location.search;
    if (path === lastPath) return;
    lastPath = path;
    const t = now();
    const recent = (visits.get(path) ?? []).filter((at) => t - at <= BACK_LOOP_WINDOW_MS);
    recent.push(t);
    visits.set(path, recent);
    if (recent.length >= BACK_LOOP_COUNT) {
      push({ kind: "back_loop", ts: ts(), moduleId: path, count: recent.length });
      visits.set(path, []); // o buclă se raportează o dată, apoi se numără din nou
    }
  }

  doc.addEventListener("click", onClick, { capture: true, passive: true });
  win.addEventListener("wheel", onWheel, { capture: true, passive: true });
  win.addEventListener("keydown", onKey, { capture: true, passive: true });
  win.visualViewport?.addEventListener("resize", zoomSoon);
  win.addEventListener("popstate", notePath);
  notePath();
  every(DWELL_CHECK_MS, () => {
    checkDwell();
    notePath(); // aplicațiile de o pagină schimbă adresa fără popstate
  });
  every(FLUSH_EVERY_MS, flush);

  return {
    helpRequest(text) {
      push({ kind: "help_request", ts: ts(), ...(text ? { text: text.slice(0, 200) } : {}) });
    },
    proposalDecision(proposalId, decision) {
      push({ kind: "proposal_decision", ts: ts(), proposalId, decision });
    },
    flush,
    stop() {
      stopped = true;
      for (const timer of timers) clearTimer(timer);
      if (zoomTimer !== null) clearTimer(zoomTimer);
      doc.removeEventListener("click", onClick, { capture: true });
      win.removeEventListener("wheel", onWheel, { capture: true });
      win.removeEventListener("keydown", onKey, { capture: true });
      win.visualViewport?.removeEventListener("resize", zoomSoon);
      win.removeEventListener("popstate", notePath);
    },
  };
}
