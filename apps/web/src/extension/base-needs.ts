// Nevoile omului pentru preferințele de bază (C4: font minim, contrast, ținte), citite din stocarea extensiei.
// Testul inițial (C3) le scrie în chrome.storage.local, cheia „onboarding”; până la profilul extins (E8) asta e sursa.
// Lipsă sau stricate: valorile implicite (HARD_LIMITS), ca pagina să primească oricum minimul.

import type { UserNeeds } from "@uishapeshifter/contracts";

export const ONBOARDING_KEY = "onboarding";
/** Cheia userId-ului anonim (E5); profilul local stă sub chiar acest userId (E8, specs/08). */
export const USER_ID_KEY = "userId";

/**
 * Nevoile, din cea mai bună sursă disponibilă: profilul local (E8, ținut la zi de service worker), altfel ce a salvat
 * testul inițial, altfel nimic (valorile implicite).
 */
export function needsFromStored(values: Record<string, unknown>): Partial<UserNeeds> {
  const userId = values[USER_ID_KEY];
  const profile = typeof userId === "string" ? values[userId] : undefined;
  if (isRecord(profile) && isRecord(profile.needs)) return needsFromStorage(profile);
  return needsFromStorage(values[ONBOARDING_KEY]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Din ce a salvat testul inițial (OnboardingResult sau doar { needs }) păstrăm câmpurile cunoscute, cu tipul corect. */
export function needsFromStorage(value: unknown): Partial<UserNeeds> {
  const raw = isRecord(value) && isRecord(value.needs) ? value.needs : {};
  const needs: Partial<UserNeeds> = {};
  if (typeof raw.minFontPx === "number" && Number.isFinite(raw.minFontPx)) needs.minFontPx = raw.minFontPx;
  if (typeof raw.minTargetPx === "number" && Number.isFinite(raw.minTargetPx)) needs.minTargetPx = raw.minTargetPx;
  if (raw.contrast === "normal" || raw.contrast === "high") needs.contrast = raw.contrast;
  if (typeof raw.reducedMotion === "boolean") needs.reducedMotion = raw.reducedMotion;
  if (typeof raw.prefersVoice === "boolean") needs.prefersVoice = raw.prefersVoice;
  return needs;
}
