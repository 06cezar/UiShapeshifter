// Ce a stricat agentul, față de ce era deja așa pe site (specs/07, „Pe site-uri reale”). Doar primele îl obligă pe agent
// să repare sau să anuleze; ce era deja sub limită ridică preferințele de bază (C4).
// „Cum era” = aceeași pagină, cu rețeta oprită pentru o clipă. Oprirea și pornirea se fac în același pas
// sincron, deci browserul nu desenează între ele și omul nu vede nimic.

import type { AuditIssue, AuditReport, AuditThresholds } from "@uishapeshifter/contracts";
import { auditPage, type PageAudit, type PageAuditOptions } from "./page-audit";

/**
 * Oprește rețeta site-ului și întoarce funcția care o pornește la loc. O dă motorul de rețete (B5), care știe cum își
 * pune foaia (în extensie: `style.disabled = true`, apoi `false`).
 */
export type PauseRecipe = () => () => void;

/** Auditul paginii fără rețeta noastră: cum arăta site-ul înainte de agent. */
export function auditWithoutRecipe(
  thresholds: AuditThresholds,
  options: PageAuditOptions & { pauseRecipe?: PauseRecipe },
): PageAudit {
  if (!options.pauseRecipe) return auditPage(thresholds, options);
  const resume = options.pauseRecipe();
  try {
    return auditPage(thresholds, options);
  } finally {
    resume();
  }
}

/**
 * Problemele din raportul de acum care nu erau pe pagina fără rețetă: aceeași regulă pe același element.
 * Un element care avea deja problema și pe care agentul a înrăutățit-o (ex. font 14px → 12px) nu apare aici;
 * îl ridică oricum preferințele de bază la minim.
 */
export function introducedIssues(current: AuditReport, withoutRecipe: AuditReport): AuditIssue[] {
  const before = new Set(withoutRecipe.issues.map(issueKey));
  return current.issues.filter((issue) => !before.has(issueKey(issue)));
}

function issueKey(issue: AuditIssue): string {
  return `${issue.rule}|${issue.elementId}`;
}
