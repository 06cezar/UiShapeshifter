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
