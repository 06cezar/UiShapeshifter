// Ce se măsoară doar din DOM-ul randat și nu e în UISnapshot: înălțimea rândului, text-overflow,
// textul decorativ și marginile elementelor interactive. Restul vine din registru (specs/04).

import type { AuditReport, AuditThresholds, UISnapshot } from "@uishapeshifter/contracts";
import { auditSnapshot, type AuditOptions, type DomFacts, type DomFactsMap } from "./audit";
import { composite, parseColor, toHex, type Rgba } from "./contrast";

const AGENT_ID_ATTR = "data-agent-id";
/** `line-height: normal` în browsere e ~1.2 din mărimea fontului. */
const NORMAL_LINE_HEIGHT = 1.2;
const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/** Faptele pentru toate elementele cu `data-agent-id` din `root`. */
export function collectDomFacts(root: ParentNode = document): DomFactsMap {
  const facts: DomFactsMap = {};
  for (const el of root.querySelectorAll<HTMLElement>(`[${AGENT_ID_ATTR}]`)) {
    const id = el.getAttribute(AGENT_ID_ATTR);
    if (id) facts[id] = factsOf(el);
  }
  return facts;
}

/** Auditul pe snapshot + DOM, pentru unealta audit_ui. */
export function auditDom(
  snapshot: UISnapshot,
  thresholds: AuditThresholds,
  opts: Omit<AuditOptions, "facts"> & { root?: ParentNode } = {},
): AuditReport {
  const { root, ...rest } = opts;
  return auditSnapshot(snapshot, thresholds, { ...rest, facts: collectDomFacts(root) });
}

export function factsOf(el: HTMLElement): DomFacts {
  const cs = getComputedStyle(el);
  const facts: DomFacts = {};

  if (hasOwnText(el)) {
    const fontPx = parseFloat(cs.fontSize);
    const lh = cs.lineHeight === "normal" ? NORMAL_LINE_HEIGHT * fontPx : parseFloat(cs.lineHeight);
    if (fontPx > 0 && Number.isFinite(lh)) facts.lineHeight = lh / fontPx;
  }
  if (cs.textOverflow === "ellipsis") facts.intentionalOverflow = true;

  const role = el.getAttribute("role");
  if (el.getAttribute("aria-hidden") === "true" || role === "presentation" || role === "none") {
    facts.decorative = true;
  }

  const border = visibleBorderColor(cs);
  if (border && el.parentElement) {
    const outside = effectiveBackground(el.parentElement);
    facts.nonText = { color: toHex(composite(border, outside)), background: toHex(outside) };
  }
  return facts;
}

/** De la atâtea rânduri în sus, cutia elementului arată text pe mai multe rânduri (rezervă, fără `Range`). */
const MULTI_LINE_BOX_FACTOR = 1.5;

/** Dreptunghiurile rândurilor de text proprii ale elementului (fără copiii lui), cum le desenează browserul. */
export function ownTextRects(el: Element): DOMRect[] {
  const range = el.ownerDocument.createRange();
  const rects: DOMRect[] = [];
  for (const node of el.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
    range.selectNodeContents(node);
    rects.push(...Array.from(range.getClientRects()));
  }
  return rects;
}

/**
 * Textul propriu al elementului stă pe un singur rând: o etichetă, un număr, un nume (nu un paragraf). Spațierea
 * rândurilor (WCAG 1.4.12) n-are ce îmbunătăți acolo, iar un rând mai înalt mută eticheta față de vecinii ei.
 * Numărăm rândurile desenate; unde motorul nu le dă (teste), judecăm după înălțimea cutiei.
 */
export function isSingleLineText(
  el: HTMLElement,
  cs: CSSStyleDeclaration = getComputedStyle(el),
  rect: DOMRect = el.getBoundingClientRect(),
): boolean {
  const lines = ownTextRects(el)
    .filter((line) => line.width > 0 && line.height > 0)
    .sort((a, b) => a.top - b.top);
  if (lines.length > 0) {
    let lastTop = lines[0]!.top;
    for (const line of lines) {
      // alt rând = începe mai jos cu peste jumătate din înălțimea lui (bucățile aceluiași rând au același „top”)
      if (line.top - lastTop > line.height / 2) return false;
      lastTop = line.top;
    }
    return true;
  }
  const fontPx = parseFloat(cs.fontSize);
  const lineHeightPx = cs.lineHeight === "normal" ? NORMAL_LINE_HEIGHT * fontPx : parseFloat(cs.lineHeight);
  if (!(lineHeightPx > 0)) return false;
  return rect.height < MULTI_LINE_BOX_FACTOR * lineHeightPx;
}

/** Cât urcăm de la text după cutia care îi limitează înălțimea (titlul unui card: span → a → h3). */
const HEIGHT_LIMIT_DEPTH = 3;
/** Valorile `overflow-y` cu care o cutie ascunde ce nu încape în ea. */
const HIDING_OVERFLOW_Y = new Set(["hidden", "clip"]);

/**
 * Textul stă într-o cutie cu înălțimea socotită de site pe rândurile lui: un titlu tăiat la două rânduri
 * (`-webkit-line-clamp`) sau o cutie cu `max-height` în px care ascunde restul. Rânduri mai înalte acolo n-ar aerisi
 * textul, ci i-ar tăia ultimul rând (titlurile din lista de clipuri de pe YouTube: 2 × 20px într-o cutie de 40px).
 */
export function isInHeightLimitedBox(el: Element): boolean {
  let node: Element | null = el;
  for (let depth = 0; node && depth <= HEIGHT_LIMIT_DEPTH; depth++, node = node.parentElement) {
    const cs = getComputedStyle(node);
    const clamp = cs.getPropertyValue("-webkit-line-clamp");
    if (clamp !== "" && clamp !== "none") return true;
    // `overflow` scurt, unde motorul nu desface `overflow-y` (happy-dom în teste)
    if (cs.maxHeight.endsWith("px") && HIDING_OVERFLOW_Y.has(cs.overflowY || cs.overflow)) return true;
  }
  return false;
}

/** Fundalul efectiv: fundalurile strămoșilor compuse de jos în sus, peste alb. */
export function effectiveBackground(el: Element | null): Rgba {
  const layers: Rgba[] = [];
  for (let node = el; node; node = node.parentElement) {
    const c = parseColor(getComputedStyle(node).backgroundColor);
    if (!c || c.a === 0) continue;
    layers.push(c);
    if (c.a >= 1) break;
  }
  return layers.reduceRight<Rgba>((under, layer) => composite(layer, under), WHITE);
}

/**
 * Sub text e o imagine sau un gradient (până la primul fundal opac)? Atunci culoarea fundalului nu se poate măsura din
 * CSS: `backgroundColor` e doar rezerva, iar textul alb de pe un banner albastru ar părea alb pe alb. Nu judecăm și
 * nu reparăm contrastul acolo.
 */
export function hasImageBackground(el: Element | null): boolean {
  for (let node = el; node; node = node.parentElement) {
    const cs = getComputedStyle(node);
    if (cs.backgroundImage && cs.backgroundImage !== "none") return true;
    const c = parseColor(cs.backgroundColor);
    if (c && c.a >= 1) return false;
  }
  return false;
}

function visibleBorderColor(cs: CSSStyleDeclaration): Rgba | null {
  for (const side of ["top", "right", "bottom", "left"]) {
    const width = parseFloat(cs.getPropertyValue(`border-${side}-width`));
    const style = cs.getPropertyValue(`border-${side}-style`);
    if (!(width > 0) || style === "none" || style === "hidden") continue;
    const color = parseColor(cs.getPropertyValue(`border-${side}-color`));
    if (color && color.a > 0) return color;
  }
  return null;
}

function hasOwnText(el: HTMLElement): boolean {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return true;
  }
  return false;
}
