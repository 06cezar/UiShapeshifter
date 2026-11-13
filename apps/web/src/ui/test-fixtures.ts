// Date comune pentru testele din ui/: pragurile scrise de mână și o funcție de contrast falsă (un tabel).
// Doar pentru teste; codul aplicației ia pragurile și contrastul din a11y-binding.ts.

import { HARD_LIMITS } from "@uishapeshifter/contracts";
import type { AuditThresholds } from "@uishapeshifter/contracts";
import type { ContrastFn } from "./limit-gate";

/** Ce dă thresholdsFor(DEFAULT_PROFILE_NEEDS) din a11y/thresholds.ts. */
export const NORMAL_THRESHOLDS: AuditThresholds = {
  minFontPx: HARD_LIMITS.minFontPx,
  minContrastText: HARD_LIMITS.minContrastText,
  minContrastLargeText: HARD_LIMITS.minContrastLargeText,
  minTargetPx: HARD_LIMITS.minTargetPx,
  minLineHeight: HARD_LIMITS.minLineHeight,
};

/** Ce dă thresholdsFor pentru `contrast: "high"`. */
export const HIGH_CONTRAST_THRESHOLDS: AuditThresholds = {
  ...NORMAL_THRESHOLDS,
  minContrastText: 7,
  minContrastLargeText: 4.5,
};

/** Rapoartele WCAG reale pentru culorile din DEFAULT_CONFIG și din teste, calculate o dată. */
export const KNOWN_RATIOS: Record<string, number> = {
  "#111827|#FFFFFF": 17.74,
  "#FFFFFF|#C2410C": 5.18,
  "#777777|#FFFFFF": 4.478,
  "#FFFFFF|#777777": 4.478, // raportul nu depinde de ordine
  "#949494|#FFFFFF": 3.03,
};

/** O pereche necunoscută aruncă, ca funcția lui C la o culoare pe care n-o înțelege. */
export function fakeContrast(table: Record<string, number> = KNOWN_RATIOS): ContrastFn & { calls: number } {
  const fn = Object.assign(
    (fg: string, bg: string) => {
      fn.calls++;
      const ratio = table[`${fg}|${bg}`];
      if (ratio === undefined) throw new Error(`culoare necunoscută: ${fg} pe ${bg}`);
      return ratio;
    },
    { calls: 0 },
  );
  return fn;
}
