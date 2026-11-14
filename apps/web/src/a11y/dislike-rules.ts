// Ce îl deranjează pe om (testul inițial, pasul 5, sau o cerere „peste tot”), aplicat pe ORICE site, fără AI, de la
// prima încărcare. Doar pentru marcajele care se recunosc sigur (rafturile de Shorts, legăturile spre Reels, reclamele
// marcate standard). Restul (pagini aglomerate, ferestre, redare automată) rămâne la agent, care vede pagina.
//
// O singură foaie de-a noastră, cu câte o regulă pe selector: un browser care nu știe un selector (ex. `:has`) aruncă
// doar regula lui, nu toată foaia. Foaia se aplică singură și elementelor apărute mai târziu: nu trebuie observator.

import type { PreferenceCategory } from "@uishapeshifter/contracts";
import { DISLIKE_ORDER } from "../onboarding/result";
import { validateCss } from "../validation";

/** „uishapeshifter” în id, ca rețeta agentului să n-o poată atinge (C5). */
export const DISLIKES_STYLE_ID = "uishapeshifter-dislikes";

/**
 * Ce ascundem pentru fiecare categorie. Un selector care nu găsește nimic pe un site nu ascunde nimic, deci lista poate
 * acoperi mai multe site-uri. Rafturile YouTube după numele lor; „/shorts/” e legătura din meniul lateral (văzută pe
 * youtube.com, 14 nov.).
 */
export const DISLIKE_SELECTORS: Partial<Record<PreferenceCategory, readonly string[]>> = {
  "short-video": [
    "ytd-reel-shelf-renderer",
    "ytd-rich-shelf-renderer[is-shorts]",
    "ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])",
    'grid-shelf-view-model:has(a[href^="/shorts/"])',
    'ytd-rich-item-renderer:has(a[href^="/shorts/"])',
    'ytd-video-renderer:has(a[href^="/shorts/"])',
    'ytd-guide-entry-renderer:has(a[href^="/shorts/"])',
    'ytd-mini-guide-entry-renderer:has(a[href^="/shorts/"])',
    "ytm-reel-shelf-renderer",
    'a[href^="/reels/"]',
  ],
  "ai-features": [
    '[aria-label="AI Overview"]',
    '[aria-label="Prezentare generală AI"]',
    '[aria-label="Prezentare generală generată de AI"]',
  ],
  stories: ['[aria-label="Stories"]', '[aria-label="Povești"]'],
  promos: [
    "ins.adsbygoogle",
    '[id^="google_ads_iframe"]',
    "[data-ad-slot]",
    "[data-text-ad]",
    "#tads",
    "#bottomads",
    "ytd-ad-slot-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "ytd-banner-promo-renderer",
    "ytd-statement-banner-renderer",
    "#masthead-ad",
  ],
};

const KNOWN_CATEGORIES = new Set<string>(DISLIKE_ORDER);

/** Foaia pentru categoriile date, trecută prin validarea CSS (C5), ca orice CSS pus de noi în pagina unui site. */
export function dislikeCss(dislikes: readonly PreferenceCategory[]): string {
  const rules = [...new Set(dislikes)].flatMap((category) =>
    (DISLIKE_SELECTORS[category] ?? []).map((selector) => `${selector} { display: none !important; }`),
  );
  return validateCss(rules.join("\n")).css;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function categoriesIn(list: unknown, pick: (item: unknown) => unknown): PreferenceCategory[] {
  if (!Array.isArray(list)) return [];
  return list.map(pick).filter((c): c is PreferenceCategory => typeof c === "string" && KNOWN_CATEGORIES.has(c));
}

/**
 * Categoriile, din stocarea extensiei: ce a ales omul la testul inițial (cheia „onboarding”, `dislikes`) plus
 * preferințele generale din profilul local (sub userId), unde ajung și cererile „peste tot” (#64). Date din afară:
 * păstrăm doar categoriile cunoscute.
 */
export function dislikesFromStored(
  values: Record<string, unknown>,
  onboardingKey: string,
  userIdKey: string,
): PreferenceCategory[] {
  const onboarding = values[onboardingKey];
  const userId = values[userIdKey];
  const profile = typeof userId === "string" ? values[userId] : undefined;
  const fromTest = isRecord(onboarding) ? categoriesIn(onboarding.dislikes, (c) => c) : [];
  const fromProfile = isRecord(profile)
    ? categoriesIn(profile.generalPreferences, (p) => (isRecord(p) ? p.category : undefined))
    : [];
  return [...new Set([...fromTest, ...fromProfile])];
}

/** Pune (sau scoate, fără categorii) foaia noastră în pagină. Aceeași foaie la un apel nou: nu se rescrie. */
export function applyDislikes(dislikes: readonly PreferenceCategory[], doc: Document = document): void {
  const css = dislikeCss(dislikes);
  const existing = doc.getElementById(DISLIKES_STYLE_ID);
  if (!css) {
    existing?.remove();
    return;
  }
  if (existing?.textContent === css) return;
  const sheet = existing ?? doc.createElement("style");
  sheet.id = DISLIKES_STYLE_ID;
  sheet.textContent = css;
  if (!existing) (doc.head ?? doc.documentElement).append(sheet);
}
