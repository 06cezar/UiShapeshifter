// Registrul de elemente (specs/04): ce „vede” agentul. Elementele se înregistrează prin useAgentElement; ca rezervă,
// orice element cu data-agent-id din DOM e găsit oricum. Snapshot-ul complet servește auditul (C) și semnalele (E);
// cel compact merge la model. Culorile și contrastul se măsoară cu funcțiile lui C (prin a11y-binding.ts).

import type { ElementInfo, Rect, UISnapshot } from "@uishapeshifter/contracts";
import type { AgentRegistry, ElementMeta, SnapshotOptions, VisibilityResult } from "../agent-bridge";
import { measureElementColors } from "./a11y-binding";
import type { ConfigStore } from "./config-store";
import { moduleIdOfRoute } from "./layout-model";

export const AGENT_ID_ATTR = "data-agent-id";
export const MODULE_ID_ATTR = "data-module-id";
/** Cel mult atâtea elemente în snapshot-ul pentru model (specs/04). */
export const MAX_MODEL_ELEMENTS = 80;
const MAX_LABEL_CHARS = 80;
/** Toleranța pentru `clipped` (specs/04): rotunjirile de subpixel nu înseamnă text tăiat. */
const CLIP_TOLERANCE_PX = 1;
/** Contrastul în snapshot-ul compact: 2 zecimale, rotunjit în jos, ca să nu pară că trece. */
const CONTRAST_DECIMALS_FACTOR = 100;
const DEFAULT_FONT_WEIGHT = 400;
const BOLD_FONT_WEIGHT = 700;

const INTERACTIVE_SELECTOR =
  "button, a[href], input, select, textarea, summary, [role='button'], [role='link'], [role='checkbox'], [role='tab'], [tabindex]:not([tabindex='-1'])";
const IMPLICIT_ROLES: Record<string, string> = {
  BUTTON: "button",
  A: "link",
  INPUT: "textbox",
  TEXTAREA: "textbox",
  SELECT: "combobox",
  IMG: "img",
  NAV: "navigation",
  MAIN: "main",
  SECTION: "region",
  H1: "heading",
  H2: "heading",
  H3: "heading",
  H4: "heading",
};

interface Entry {
  element: HTMLElement;
  meta: ElementMeta;
}

export function createRegistry(store: ConfigStore, root: ParentNode = document): AgentRegistry {
  const entries = new Map<string, Entry>();

  /** Toate elementele: întâi cele din DOM (în ordinea lor), apoi cele înregistrate care nu (mai) au atributul. */
  function allEntries(): [string, Entry][] {
    const found = new Map<string, Entry>();
    for (const element of root.querySelectorAll<HTMLElement>(`[${AGENT_ID_ATTR}]`)) {
      const id = element.getAttribute(AGENT_ID_ATTR);
      if (id && !found.has(id)) found.set(id, { element, meta: entries.get(id)?.meta ?? {} });
    }
    for (const [id, entry] of entries) {
      if (!found.has(id) && entry.element.isConnected) found.set(id, entry);
    }
    return [...found];
  }

  function get(id: string): HTMLElement | undefined {
    const entry = entries.get(id);
    if (entry?.element.isConnected) return entry.element;
    return allEntries().find(([candidate]) => candidate === id)?.[1].element;
  }

  function snapshot(opts: SnapshotOptions = {}): UISnapshot {
    const state = store.getState();
    const view = viewport();
    let elements = allEntries().map(([id, entry]) => measure(id, entry, view));
    if (opts.moduleId) elements = elements.filter((e) => e.moduleId === opts.moduleId || isNavigation(e.id));
    return {
      route: state.route,
      configRevision: state.config.revision,
      viewport: view,
      openOverlays: [...state.openOverlays],
      elements,
      takenAt: new Date().toISOString(),
    };
  }

  return {
    get,
    ids: () => allEntries().map(([id]) => id),
    snapshot,

    compactSnapshot(opts = {}) {
      const full = snapshot();
      const moduleId = opts.moduleId ?? moduleIdOfRoute(full.route);
      const kept = full.elements
        .filter((e) => e.visible && (e.moduleId === moduleId || isNavigation(e.id)))
        .sort((a, b) => priority(a) - priority(b))
        .slice(0, MAX_MODEL_ELEMENTS)
        .map(roundElement);
      return { ...full, elements: kept };
    },

    rectOf(id) {
      return get(id)?.getBoundingClientRect();
    },

    async ensureVisible(id): Promise<VisibilityResult> {
      const element = get(id);
      if (!element) return "hidden";
      const info = measure(id, { element, meta: {} }, viewport());
      if (!info.visible) return "hidden";
      if (info.inViewport) return "visible";
      element.scrollIntoView({ block: "center" });
      return "scrolled";
    },

    register(id, element, meta = {}) {
      // Atributul îl citesc și rezerva din snapshot, și auditul lui C (collectDomFacts).
      if (!element.hasAttribute(AGENT_ID_ATTR)) element.setAttribute(AGENT_ID_ATTR, id);
      entries.set(id, { element, meta });
      return () => {
        if (entries.get(id)?.element === element) entries.delete(id);
      };
    },
  };
}

/** Navigația e mereu pe ecran și intră în orice snapshot de modul (ca la auditul lui C). */
export function isNavigation(id: string): boolean {
  return id.startsWith("nav.") || id === "menu.more";
}

function viewport(): UISnapshot["viewport"] {
  return { width: window.innerWidth, height: window.innerHeight };
}

function measure(id: string, { element, meta }: Entry, view: UISnapshot["viewport"]): ElementInfo {
  const box = element.getBoundingClientRect();
  const rect: Rect = { x: box.x, y: box.y, width: box.width, height: box.height };
  const style = getComputedStyle(element);
  const visible = rect.width > 0 && rect.height > 0 && !isHiddenByStyle(element, style);
  const info: ElementInfo = {
    id,
    role: meta.role ?? element.getAttribute("role") ?? IMPLICIT_ROLES[element.tagName] ?? element.tagName.toLowerCase(),
    label: labelOf(element, meta),
    moduleId: moduleIdOf(id, element, meta),
    rect,
    visible,
    inViewport: visible && intersectsViewport(rect, view),
    interactive: isInteractive(element),
    clipped: isClipped(element, style),
  };
  if (!hasText(element)) return info;

  info.fontPx = parseFloat(style.fontSize) || undefined;
  info.fontWeight = fontWeightOf(style.fontWeight);
  const colors = measureElementColors(element, style.color);
  if (colors) Object.assign(info, colors);
  return info;
}

/**
 * Textul e tăiat dacă conținutul depășește cutia pe o axă (cu toleranța de 1px), DAR nu pe o axă care derulează:
 * o listă cu overflow auto/scroll nu e text tăiat.
 */
function isClipped(element: HTMLElement, style: CSSStyleDeclaration): boolean {
  const scrollsX = scrolls(style.overflowX);
  const scrollsY = scrolls(style.overflowY);
  const overX = element.scrollWidth > element.clientWidth + CLIP_TOLERANCE_PX;
  const overY = element.scrollHeight > element.clientHeight + CLIP_TOLERANCE_PX;
  return (overX && !scrollsX) || (overY && !scrollsY);
}

function scrolls(overflow: string): boolean {
  return overflow === "auto" || overflow === "scroll";
}

/** display/visibility pe element și opacitatea 0 pe el sau pe un strămoș (opacitatea nu se moștenește). */
function isHiddenByStyle(element: HTMLElement, style: CSSStyleDeclaration): boolean {
  if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return true;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const cs = node === element ? style : getComputedStyle(node);
    if (cs.display === "none" || cs.opacity === "0") return true;
  }
  return false;
}

function intersectsViewport(rect: Rect, view: UISnapshot["viewport"]): boolean {
  return rect.x < view.width && rect.y < view.height && rect.x + rect.width > 0 && rect.y + rect.height > 0;
}

function isInteractive(element: HTMLElement): boolean {
  return element.matches(INTERACTIVE_SELECTOR) && !element.matches(":disabled");
}

function labelOf(element: HTMLElement, meta: ElementMeta): string {
  const text = meta.label ?? element.getAttribute("aria-label") ?? element.textContent ?? "";
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_CHARS);
}

/** Din meta, apoi din cel mai apropiat strămoș cu data-module-id; navigația nu ține de un modul. */
function moduleIdOf(id: string, element: HTMLElement, meta: ElementMeta): string | undefined {
  if (meta.moduleId) return meta.moduleId;
  if (isNavigation(id)) return undefined;
  return element.closest(`[${MODULE_ID_ATTR}]`)?.getAttribute(MODULE_ID_ATTR) ?? undefined;
}

function hasText(element: HTMLElement): boolean {
  return (element.textContent ?? "").trim().length > 0;
}

function fontWeightOf(value: string): number {
  if (value === "bold") return BOLD_FONT_WEIGHT;
  const weight = parseInt(value, 10);
  return Number.isFinite(weight) ? weight : DEFAULT_FONT_WEIGHT;
}

/** Pentru model: navigația întâi, apoi ce se poate apăsa, apoi restul. */
function priority(element: ElementInfo): number {
  if (isNavigation(element.id)) return 0;
  return element.interactive ? 1 : 2;
}

function roundElement(element: ElementInfo): ElementInfo {
  const rounded: ElementInfo = {
    ...element,
    rect: {
      x: Math.round(element.rect.x),
      y: Math.round(element.rect.y),
      width: Math.round(element.rect.width),
      height: Math.round(element.rect.height),
    },
  };
  if (element.fontPx !== undefined) rounded.fontPx = Math.round(element.fontPx);
  if (element.contrast !== undefined) {
    rounded.contrast = Math.floor(element.contrast * CONTRAST_DECIMALS_FACTOR) / CONTRAST_DECIMALS_FACTOR;
  }
  return rounded;
}
