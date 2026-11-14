// Unealta audit_ui pe pagina unui site (C2, specs/05 și 07). Executorul uneltelor din content script (B2) o cheamă
// cu argumentele de la model și primește ToolResult<AuditReport>: problemele, `fixCss` unde reparația e evidentă și
// `introduced` pe ce a adus agentul.

import type { AuditReport, AuditThresholds, ToolResult } from "@uishapeshifter/contracts";
import { withFixCss } from "./fix-css";
import { auditWithoutRecipe, introducedIssues, type PauseRecipe } from "./introduced";
import { auditPage, type PageAuditOptions, type PageIdentity } from "./page-audit";

export interface AuditToolDeps {
  /** Pragurile omului (din profil, `thresholdsFor(needs)`), citite la fiecare apel: profilul se poate schimba. */
  thresholds(): AuditThresholds;
  identity: PageIdentity;
  ourHostId: string;
  /** Revizia rețetei aplicate acum. */
  revision(): number;
  /** Elementul zonei din PageSnapshot (registrul, B2); fără el, `regionId` nu se poate folosi. */
  regionElement?(regionId: string): Element | undefined;
  /** Oprește rețeta pentru auditul „cum era” (motorul de rețete, B5); fără ea, nicio problemă nu e `introduced`. */
  pauseRecipe?: PauseRecipe;
  doc?: Document;
}

/** Argumentele de la model: `{}` sau `{ regionId }`; `moduleId` e al aplicației vechi și se ignoră pe site-uri. */
export function parseAuditArgs(args: unknown): { regionId?: string } | undefined {
  if (args === undefined || args === null) return {};
  if (typeof args !== "object" || Array.isArray(args)) return undefined;
  const { regionId, moduleId, ...rest } = args as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return undefined;
  if (moduleId !== undefined && typeof moduleId !== "string") return undefined;
  if (regionId === undefined) return {};
  return typeof regionId === "string" && regionId.trim() !== "" ? { regionId } : undefined;
}

export function runAuditUi(args: unknown, deps: AuditToolDeps): ToolResult<AuditReport> {
  const parsed = parseAuditArgs(args);
  if (!parsed) {
    return {
      ok: false,
      error: {
        code: "INVALID_ARGS",
        message: 'audit_ui primește {} sau { regionId: text }, ex. { regionId: "r.main" }.',
      },
    };
  }
  let root: Element | undefined;
  if (parsed.regionId) {
    root = deps.regionElement?.(parsed.regionId);
    if (!root) {
      return {
        ok: false,
        error: {
          code: "ELEMENT_NOT_FOUND",
          message: `Zona ${parsed.regionId} nu există. Zonele sunt în regions din get_page_snapshot.`,
        },
      };
    }
  }

  const thresholds = deps.thresholds();
  const options: PageAuditOptions = {
    identity: deps.identity,
    ourHostId: deps.ourHostId,
    revision: deps.revision(),
    doc: deps.doc,
    root,
  };
  const audit = withFixCss(auditPage(thresholds, options));
  const now = audit.report;
  const original = auditWithoutRecipe(thresholds, { ...options, pauseRecipe: deps.pauseRecipe }).report;
  const introduced = new Set(introducedIssues(now, original));
  // Tăierea dintr-o cutie în care agentul a pus ceva e a lui, chiar dacă apare și cu rețeta oprită (elementele adăugate
  // rămân în pagină). Găsit de A la proba pasului 4: rândurile din #facturi tăiate, dar audit cu 0 probleme introduse.
  const byAgentShape = (issue: (typeof now.issues)[number]) =>
    issue.rule === "clipped" && audit.facts[issue.elementId]?.clippedByAgentShape === true;
  const issues = now.issues.map((issue) =>
    introduced.has(issue) || byAgentShape(issue) ? { ...issue, introduced: true } : issue,
  );
  return { ok: true, data: { ...now, issues } };
}
