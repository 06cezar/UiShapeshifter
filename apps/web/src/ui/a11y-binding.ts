// Singurul loc unde ui/ se leagă de funcțiile de accesibilitate ale lui C (a11y/, specs/07): store-ul și registrul.
// Restul din ui/ primește contrastul și pragurile ca parametri, ca să poată fi testat fără a11y/.

import type { UIConfig, UserNeeds } from "@uishapeshifter/contracts";
import {
  adjustToContrast,
  composite,
  contrastRatio,
  effectiveBackground,
  parseColor,
  thresholdsFor,
  toHex,
} from "../a11y";
import { createConfigStore } from "./config-store";
import type { ConfigStore } from "./config-store";
import type { ContrastFn } from "./limit-gate";
import { adjustConfigToProfile } from "./profile-defaults";

export const realContrastRatio: ContrastFn = (foreground, background) => contrastRatio(foreground, background);
export const realAdjustToContrast = (color: string, background: string, target: number): string =>
  adjustToContrast(color, background, target);
export { thresholdsFor };

/**
 * Culorile unui element din DOM, cum le măsoară și auditul lui C: textul compus peste fundalul efectiv,
 * fundalul efectiv (strămoșii compuși peste alb) și raportul WCAG. `null` dacă culoarea textului nu se poate citi.
 */
export function measureElementColors(
  element: HTMLElement,
  textColor: string,
): { color: string; background: string; contrast: number } | null {
  const parsed = parseColor(textColor);
  if (!parsed) return null;
  const background = effectiveBackground(element);
  const color = toHex(parsed.a < 1 ? composite(parsed, background) : parsed);
  return { color, background: toHex(background), contrast: contrastRatio(color, background) };
}

/** Config-ul ajustat după nevoile utilizatorului, cu funcțiile reale de contrast. */
export function configForNeeds(config: UIConfig, needs: UserNeeds): UIConfig {
  return adjustConfigToProfile(config, thresholdsFor(needs), {
    ratio: realContrastRatio,
    adjust: realAdjustToContrast,
  });
}

/** Store-ul aplicației, cu pragurile utilizatorului și contrastul WCAG real. */
export function createAppConfigStore(needs: UserNeeds, initial?: UIConfig): ConfigStore {
  return createConfigStore({ contrastRatio: realContrastRatio, thresholds: thresholdsFor(needs), initial });
}
