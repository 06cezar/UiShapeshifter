// Preferințele de aspect cerute „peste tot” (ex. „fundal verde pe toate site-urile”): agentul le-a salvat în profil
// cu CSS-ul pe care l-a aplicat (GeneralPreference.css, specs/08), iar extensia îl pune singură pe orice site, fără AI,
// de la prima încărcare. Ca regulile de ascuns ale lui C (dislike-rules), dar cu CSS-ul omului.

import { genericPreferenceCss, type GeneralPreference } from "@uishapeshifter/contracts";
import { validateCss } from "../validation";

/** „uishapeshifter” în id, ca rețeta unui site să n-o poată atinge (C5). */
export const GENERAL_STYLE_ID = "uishapeshifter-general";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** CSS-ul preferințelor de aspect din profilul local (sub userId). Date din afară: doar textele. */
export function generalCssFrom(values: Record<string, unknown>, userIdKey: string): string {
  const userId = values[userIdKey];
  const profile = typeof userId === "string" ? values[userId] : undefined;
  const preferences = isRecord(profile) && Array.isArray(profile.generalPreferences) ? profile.generalPreferences : [];
  return (preferences as Partial<GeneralPreference>[])
    .map((preference) => (isRecord(preference) && typeof preference.css === "string" ? preference.css.trim() : ""))
    .filter(Boolean)
    .join("\n");
}

/**
 * Pune (sau scoate, fără CSS) foaia noastră; trece prin validarea CSS (C5) ca orice CSS pus de noi pe un site.
 * Stă prima în <head>: rețeta site-ului (pusă după) și fontul minim (C4, inline) o bat la egalitate (nota lui A).
 */
export function applyGeneralStyle(css: string, doc: Document = document): void {
  const safe = css ? validateCss(genericPreferenceCss(css)).css : "";
  const existing = doc.getElementById(GENERAL_STYLE_ID);
  if (!safe) {
    existing?.remove();
    return;
  }
  if (existing?.textContent === safe) return;
  const sheet = existing ?? doc.createElement("style");
  sheet.id = GENERAL_STYLE_ID;
  sheet.textContent = safe;
  if (!existing) (doc.head ?? doc.documentElement).prepend(sheet);
}
