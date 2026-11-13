// Auditul de accesibilitate (unealta audit_ui). Regulile și pragurile: specs/07-accesibilitate.md.

import type { JsonPatchOp } from "./ui-config";

export type AuditRule =
  | "min-font"     // text sub fontul minim (global și din profil)
  | "contrast"     // contrast WCAG sub prag
  | "target-size"  // țintă de click sub minTargetPx
  | "overlap"      // două elemente interactive se suprapun
  | "clipped"      // text tăiat
  | "offscreen"    // element interactiv în afara ecranului (pe orizontală)
  | "line-height"; // înălțimea rândului sub minim

export interface AuditIssue {
  rule: AuditRule;
  severity: "error" | "warning";
  elementId: string;
  measured: number | string;
  expected: number | string;
  message: string;           // în română, pe înțeles, ex. „Textul are 13px; minimul tău e 18px.”
  fix?: JsonPatchOp[];       // propunerea de reparație, dacă se poate deduce
}

export interface AuditThresholds {
  minFontPx: number;         // max(HARD_LIMITS.minFontPx, profile.needs.minFontPx)
  minContrastText: number;   // 4.5, sau 7 dacă profile.needs.contrast === "high"
  minContrastLargeText: number;
  minTargetPx: number;       // max(HARD_LIMITS.minTargetPx, profile.needs.minTargetPx)
  minLineHeight: number;
}

export interface AuditReport {
  ok: boolean;               // fără erori (avertismentele nu contează)
  score: number;             // 0–100, pentru panou și pitch
  issues: AuditIssue[];
  thresholds: AuditThresholds;
  checkedElements: number;
  configRevision: number;
  checkedAt: string;
}
