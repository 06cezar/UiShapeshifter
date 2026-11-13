// „DEFAULT_CONFIG ajustat după profil” (specs/02, regula 5): config-ul de pornire, și orice config salvat, urcă la
// pragurile utilizatorului înainte să intre în store. Doar urcă: ce e deja peste prag rămâne cum e.
// Contrastul și ajustarea culorilor vin ca parametri (în aplicație: funcțiile lui C, prin a11y-binding.ts).

import { HARD_LIMITS } from "@uishapeshifter/contracts";
import type { AuditThresholds, UIConfig } from "@uishapeshifter/contracts";
import { requiredThemeContrast } from "./limit-gate";
import type { ContrastFn } from "./limit-gate";

/** Cea mai apropiată variantă a culorii care atinge `target` pe `background` (adjustToContrast din a11y/contrast.ts). */
export type AdjustColorFn = (color: string, background: string, target: number) => string;

export interface ContrastTools {
  ratio: ContrastFn;
  adjust: AdjustColorFn;
}

export function adjustConfigToProfile(
  config: UIConfig,
  thresholds: AuditThresholds,
  contrast: ContrastTools,
): UIConfig {
  const next = structuredClone(config);
  const theme = next.theme;

  // Dacă profilul cere peste maximul permis, ne oprim la maxim; poarta va spune explicit de ce nu trece.
  theme.baseFontPx = Math.min(Math.max(theme.baseFontPx, thresholds.minFontPx), HARD_LIMITS.maxFontPx);
  theme.lineHeight = Math.max(theme.lineHeight, thresholds.minLineHeight);
  next.minTargetPx = Math.max(next.minTargetPx, thresholds.minTargetPx);

  // Pragul depinde de font (text mare), deci îl calculăm după ce fontul a urcat.
  const required = requiredThemeContrast(next, thresholds);
  const palette = theme.palette;
  if (isBelow(contrast.ratio, palette.text, palette.background, required)) {
    palette.text = contrast.adjust(palette.text, palette.background, required);
  }
  // Pentru butoane schimbăm fundalul (primary), nu textul: butonul rămâne „alb pe culoare”, doar mai închis.
  if (isBelow(contrast.ratio, palette.onPrimary, palette.primary, required)) {
    palette.primary = contrast.adjust(palette.primary, palette.onPrimary, required);
  }
  return next;
}

/** O culoare pe care funcția de contrast n-o înțelege rămâne neatinsă; poarta o va refuza cu un mesaj clar. */
function isBelow(ratio: ContrastFn, foreground: string, background: string, required: number): boolean {
  try {
    return ratio(foreground, background) < required;
  } catch {
    return false;
  }
}
