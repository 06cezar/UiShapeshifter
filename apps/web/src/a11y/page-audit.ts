// Auditul pe pagina unui site real (C2, specs/07): aceleași reguli ca în audit.ts, dar elementele vin din DOM-ul
// site-ului, nu din registrul aplicației noastre. Id-urile și selectorii îi dau registrul paginii (B2), ca o problemă
// să se poată arăta cu `point_at` și repara cu `apply_css` pe același element.

import type { AuditReport, AuditThresholds, ElementInfo } from "@uishapeshifter/contracts";
import { computeScore, runRules, type DomFacts, type DomFactsMap } from "./audit";
import { composite, parseColor, toHex } from "./contrast";
import { effectiveBackground, factsOf } from "./dom";

/** Cum numește registrul paginii un element: id pentru raport, selector pentru CSS-ul de reparație. */
export interface PageIdentity {
  idOf(element: Element): string;
  selectorOf(element: Element): string;
}

export interface PageAuditOptions {
  identity: PageIdentity;
  /** Gazda interfeței noastre (HOST_ID din extensie): tot ce e sub ea se sare, se verifică separat. */
  ourHostId: string;
  /** Revizia rețetei aplicate acum; ajunge în `configRevision`, ca agentul să știe ce a verificat. */
  revision: number;
  doc?: Document;
  /** Doar o zonă a paginii (`regionId` la audit_ui); implicit tot `body`. */
  root?: Element;
  now?: () => Date;
}

export interface PageAudit {
  report: AuditReport;
  /** Selectorul fiecărui element din raport, după id: din el se face `fixCss`. */
  selectors: Record<string, string>;
  /** Elementele măsurate, după id: culorile și mărimile din care se calculează reparațiile. */
  elements: Record<string, ElementInfo>;
  facts: DomFactsMap;
}

/**
 * O pagină reală are mii de elemente; le măsurăm pe primele atâtea, cele din ecran întâi. Peste, auditul ar dura prea
 * mult pentru o unealtă chemată după fiecare schimbare (`RUN_LIMITS.toolTimeoutMs`).
 */
export const MAX_AUDITED_ELEMENTS = 300;
/** Câte elemente din DOM parcurgem cel mult ca să găsim candidații. */
export const MAX_SCANNED_ELEMENTS = 5000;
const LABEL_MAX_CHARS = 80;
/**
 * Textul „doar pentru cititorul de ecran” (clasa sr-only a multor site-uri) are 1×1px și `clip`: e acolo intenționat,
 * nu se vede, deci nu e nici „tăiat”, nici „mic”.
 */
const SCREEN_READER_ONLY_MAX_PX = 1;

/** Ce se poate apăsa: ținta de atingere și suprapunerile se judecă doar pe acestea. */
export const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "summary",
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="switch"]',
].join(",");
/** Etichete al căror conținut nu se vede sau nu e al paginii. */
export const SKIPPED_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "svg",
  "canvas",
  "video",
  "head",
]);
const IMPLICIT_ROLES: Record<string, string> = {
  a: "link",
  button: "button",
  input: "textbox",
  select: "combobox",
  textarea: "textbox",
  summary: "button",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  img: "img",
};

export function auditPage(thresholds: AuditThresholds, options: PageAuditOptions): PageAudit {
  const doc = options.doc ?? document;
  // clientWidth fără bara de derulare; 0 doar unde nu e layout (teste), atunci fereastra.
  const viewport = {
    width: doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0,
    height: doc.documentElement.clientHeight || doc.defaultView?.innerHeight || 0,
  };
  const measured = measurePage(doc, options, viewport);
  const elements = Object.values(measured.elements);
  const issues = runRules(elements, viewport, thresholds, measured.facts);
  const report: AuditReport = {
    ok: !issues.some((issue) => issue.severity === "error"),
    score: computeScore(issues),
    issues,
    thresholds,
    checkedElements: elements.length,
    configRevision: options.revision,
    checkedAt: (options.now ?? (() => new Date()))().toISOString(),
  };
  return { report, ...measured };
}

/** Elementele de verificat: cu text propriu sau interactive, vizibile, din afara interfeței noastre. */
function measurePage(
  doc: Document,
  options: PageAuditOptions,
  viewport: { width: number; height: number },
): Omit<PageAudit, "report"> {
  const candidates: { element: HTMLElement; rect: DOMRect; inViewport: boolean }[] = [];
  const walker = doc.createTreeWalker(options.root ?? doc.body ?? doc.documentElement, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const element = node as Element;
      if (SKIPPED_TAGS.has(element.localName) || element.id === options.ourHostId) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let scanned = 0;
  for (let node = walker.nextNode(); node && scanned < MAX_SCANNED_ELEMENTS; node = walker.nextNode()) {
    scanned += 1;
    const element = node as HTMLElement;
    if (!isInteractive(element) && !hasOwnText(element)) continue;
    const rect = element.getBoundingClientRect();
    if (!isVisible(element, rect)) continue;
    candidates.push({ element, rect, inViewport: intersectsViewport(rect, viewport) });
  }
  // Cele din ecran întâi: pe ele le vede omul acum și pe ele lucrează agentul.
  candidates.sort((a, b) => Number(b.inViewport) - Number(a.inViewport));

  const result: Omit<PageAudit, "report"> = { selectors: {}, elements: {}, facts: {} };
  for (const { element, rect, inViewport } of candidates.slice(0, MAX_AUDITED_ELEMENTS)) {
    const id = options.identity.idOf(element);
    result.elements[id] = describe(element, id, rect, inViewport);
    result.facts[id] = pageFactsOf(element);
    result.selectors[id] = options.identity.selectorOf(element);
  }
  return result;
}

function describe(element: HTMLElement, id: string, rect: DOMRect, inViewport: boolean): ElementInfo {
  const style = getComputedStyle(element);
  const background = effectiveBackground(element);
  const info: ElementInfo = {
    id,
    role: element.getAttribute("role") ?? IMPLICIT_ROLES[element.localName] ?? element.localName,
    label: labelOf(element),
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    visible: true,
    inViewport,
    interactive: isInteractive(element),
    background: toHex(background),
    clipped: isClipped(element, style),
  };
  if (hasOwnText(element)) {
    const color = parseColor(style.color);
    info.fontPx = parseFloat(style.fontSize);
    info.fontWeight = parseInt(style.fontWeight, 10) || undefined;
    if (color) info.color = toHex(composite(color, background));
  }
  return info;
}

/** Faptele din dom.ts, plus ce îi trebuie reparației: un element inline nu ia `min-height`. */
function pageFactsOf(element: HTMLElement): DomFacts {
  const facts = factsOf(element);
  const style = getComputedStyle(element);
  if (style.display === "inline") facts.inline = true;
  if (isLinkInSentence(element, style)) facts.inSentence = true;
  return facts;
}

/**
 * Un link în mijlocul unei propoziții (WCAG 2.5.5 îl scutește): nu se cere țintă mare, fiindcă mărit ar rupe rândul
 * de text în care stă. Urcăm prin strămoșii inline (`<sup>` al notelor de subsol, `<span>`, `<b>`) până la blocul în
 * care curge textul: dacă oricare dintre ei are text propriu, linkul e în frază. Doar butoanele și linkurile de sine
 * stătătoare (meniuri, liste) au nevoie de ținte mari.
 */
export function isLinkInSentence(element: Element, style: CSSStyleDeclaration = getComputedStyle(element)): boolean {
  if (style.display !== "inline") return false;
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (hasOwnText(ancestor)) return true;
    if (getComputedStyle(ancestor).display !== "inline") return false; // am ajuns la bloc, fără text în jur
  }
  return false;
}

export function isInteractive(element: Element): boolean {
  return element.matches(INTERACTIVE_SELECTOR);
}

export function hasOwnText(element: Element): boolean {
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return true;
  }
  return false;
}

export function isVisible(element: Element, rect: DOMRect): boolean {
  if (rect.width <= SCREEN_READER_ONLY_MAX_PX || rect.height <= SCREEN_READER_ONLY_MAX_PX) return false;
  const style = getComputedStyle(element);
  // `opacity` gol înseamnă valoarea implicită, 1.
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
}

function intersectsViewport(rect: DOMRect, viewport: { width: number; height: number }): boolean {
  return rect.bottom > 0 && rect.right > 0 && rect.top < viewport.height && rect.left < viewport.width;
}

/**
 * Tăiat = conținutul nu încape ȘI e ascuns. Un element inline are `clientWidth` 0, iar unul cu `overflow: visible`
 * revarsă textul fără să-l taie: niciunul nu e „tăiat”.
 */
function isClipped(element: HTMLElement, style: CSSStyleDeclaration): boolean {
  if (style.display === "inline" || (style.overflowX === "visible" && style.overflowY === "visible")) return false;
  return element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;
}

function labelOf(element: HTMLElement): string {
  const text = element.getAttribute("aria-label") ?? element.textContent ?? "";
  return text.replace(/\s+/g, " ").trim().slice(0, LABEL_MAX_CHARS);
}
