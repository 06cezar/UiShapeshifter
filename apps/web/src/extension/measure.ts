// Măsurătorile pentru pitch (E4, specs/12: „cifre măsurate, nu inventate”): ce vede omul pe pagină, cât a ascuns
// rețeta, câte click-uri până la o acțiune și scorul de accesibilitate. Rulează în pagină, în build-ul de dezvoltare
// (uiMeasure în consolă), înainte și după agent, pe același site.

import { auditPage } from "../a11y/page-audit";
import { isInteractive, isVisible } from "../a11y/page-audit";
import type { AuditThresholds } from "@uishapeshifter/contracts";

export interface PageMeasure {
  /** Butoane, linkuri și câmpuri vizibile acum (fără interfața noastră). */
  visibleInteractive: number;
  /**
   * Câte dintre ele a ascuns CSS-ul rețetei (vizibile cu foaia oprită). Elementele scoase cu operații DomOp (remove)
   * nu intră aici (nota lui D pe #91); la pitch spunem „ascunse de CSS”.
   */
  hiddenByRecipe: number;
  /** Click-uri până la elementul cerut: 1 dacă e la vedere, 2 dacă e într-un meniu închis, null dacă nu există. */
  clicksTo: number | null;
  /** Scorul auditului de accesibilitate (0–100). */
  auditScore: number;
}

export interface MeasureDeps {
  ourHostId: string;
  thresholds(): AuditThresholds;
  idOf(element: Element): string;
  selectorOf(element: Element): string;
  revision(): number;
  /** Oprește rețeta și întoarce funcția care o repornește. */
  pauseRecipe(): () => void;
  doc?: Document;
}

function visibleInteractive(doc: Document, ourHostId: string): Element[] {
  return [
    ...doc.querySelectorAll(
      "a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link]",
    ),
  ].filter(
    (element) =>
      isInteractive(element) &&
      element.closest(`#${CSS.escape(ourHostId)}`) === null &&
      isVisible(element, element.getBoundingClientRect()),
  );
}

/** Click-uri până la un element după textul lui (ex. „Plătește factura”). */
export function clicksTo(doc: Document, text: string): number | null {
  const wanted = text.trim().toLowerCase();
  const target = [...doc.querySelectorAll("a, button, [role=button], [role=link]")].find((element) =>
    (element.textContent ?? "").trim().toLowerCase().includes(wanted),
  );
  if (!target) return null;
  if (isVisible(target, target.getBoundingClientRect())) return 1;
  // Într-un meniu închis: un click să-l deschizi, unul pe buton.
  return target.closest("details:not([open])") ? 2 : null;
}

export function measurePage(deps: MeasureDeps, target = "Plătește factura"): PageMeasure {
  const doc = deps.doc ?? document;
  const now = visibleInteractive(doc, deps.ourHostId);
  const resume = deps.pauseRecipe();
  const before = visibleInteractive(doc, deps.ourHostId);
  resume();
  const audit = auditPage(deps.thresholds(), {
    identity: { idOf: deps.idOf, selectorOf: deps.selectorOf },
    ourHostId: deps.ourHostId,
    revision: deps.revision(),
    doc,
  });
  return {
    visibleInteractive: now.length,
    hiddenByRecipe: Math.max(0, before.length - now.length),
    clicksTo: clicksTo(doc, target),
    auditScore: audit.report.score,
  };
}
