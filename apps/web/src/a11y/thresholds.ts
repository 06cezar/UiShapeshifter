// Pragurile auditului pentru un utilizator: limitele globale, ridicate după profil (specs/07, specs/08).
// Profilul poate doar URCA pragurile, niciodată coborî sub HARD_LIMITS.

import { HARD_LIMITS } from "@uishapeshifter/contracts";
import type { AuditThresholds, UserNeeds } from "@uishapeshifter/contracts";

/** Contrastul cerut cu `needs.contrast === "high"` (WCAG 1.4.6, nivelul AAA). */
export const HIGH_CONTRAST_TEXT = 7;
export const HIGH_CONTRAST_LARGE_TEXT = 4.5;

export function thresholdsFor(needs?: Partial<UserNeeds>): AuditThresholds {
  const high = needs?.contrast === "high";
  return {
    minFontPx: Math.max(HARD_LIMITS.minFontPx, finite(needs?.minFontPx)),
    minContrastText: high ? HIGH_CONTRAST_TEXT : HARD_LIMITS.minContrastText,
    minContrastLargeText: high ? HIGH_CONTRAST_LARGE_TEXT : HARD_LIMITS.minContrastLargeText,
    minTargetPx: Math.max(HARD_LIMITS.minTargetPx, finite(needs?.minTargetPx)),
    minLineHeight: HARD_LIMITS.minLineHeight,
  };
}

function finite(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
