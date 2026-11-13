// Reparațiile auditului ca CSS (specs/07, „Reparațiile (fixCss)”): agentul le dă lui apply_css (append).
// Propunem doar când reparația e evidentă și nu schimbă ce înseamnă pagina: font, culoarea textului, mărimea țintei,
// înălțimea rândului. Textul tăiat, suprapunerile și ce iese din ecran țin de așezare: decide agentul.
// `!important`: regulile site-ului pot avea selectori mai specifici decât al nostru, iar o reparație care pierde
// în cascadă ar face auditul următor să pice din nou, deci agentul ar repara în cerc.

import type { AuditIssue, AuditThresholds, ElementInfo } from "@uishapeshifter/contracts";
import type { DomFacts } from "./audit";
import { adjustToContrast, contrastRatio, parseColor, requiredTextContrast } from "./contrast";
import type { PageAudit } from "./page-audit";

export function fixCssFor(
  issue: AuditIssue,
  element: ElementInfo | undefined,
  selector: string | undefined,
  thresholds: AuditThresholds,
  facts: DomFacts = {},
): string | undefined {
  if (!element || !selector) return undefined;
  switch (issue.rule) {
    case "min-font":
      return rule(selector, [`font-size: ${thresholds.minFontPx}px`]);
    case "contrast":
      return fixTextColor(element, selector, thresholds);
    case "target-size": {
      const size = `${thresholds.minTargetPx}px`;
      // Un link inline nu ia min-height; inline-block îl lasă în rând, dar cu mărimea cerută.
      const display = facts.inline ? ["display: inline-block"] : [];
      return rule(selector, [...display, `min-height: ${size}`, `min-width: ${size}`]);
    }
    case "line-height":
      return rule(selector, [`line-height: ${thresholds.minLineHeight}`]);
    default:
      return undefined;
  }
}

/** Raportul cu `fixCss` pe fiecare problemă care are o reparație evidentă. */
export function withFixCss(audit: PageAudit): PageAudit {
  const { report, elements, selectors, facts } = audit;
  const issues = report.issues.map((issue) => {
    const fixCss = fixCssFor(
      issue,
      elements[issue.elementId],
      selectors[issue.elementId],
      report.thresholds,
      facts[issue.elementId],
    );
    return fixCss ? { ...issue, fixCss } : issue;
  });
  return { ...audit, report: { ...report, issues } };
}

/**
 * Aceeași nuanță, mai închisă sau mai deschisă, până atinge pragul pe fundalul ei. Doar pentru contrastul textului:
 * o problemă de contrast la margine (WCAG 1.4.11) are textul în regulă și rămâne fără reparație.
 */
function fixTextColor(element: ElementInfo, selector: string, thresholds: AuditThresholds): string | undefined {
  const { color, background } = element;
  if (!color || !background || !parseColor(color) || !parseColor(background)) return undefined;
  const required = requiredTextContrast(element.fontPx, element.fontWeight, thresholds);
  if (contrastRatio(color, background) >= required) return undefined;
  return rule(selector, [`color: ${adjustToContrast(color, background, required)}`]);
}

function rule(selector: string, declarations: string[]): string {
  return `${selector} { ${declarations.map((d) => `${d} !important`).join("; ")}; }`;
}
