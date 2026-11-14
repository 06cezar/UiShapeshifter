// Din răspunsurile testului inițial la OnboardingResult (specs/10, coloana „Rezultat”).
// Funcții pure: ecranele adună răspunsurile, aici se decid valorile din profil.

import { HARD_LIMITS } from "@uishapeshifter/contracts";
import type { OnboardingResult, Persona, PreferenceCategory, UserProfile } from "@uishapeshifter/contracts";

/** Pasul 2: aceeași propoziție la mărimile astea (14px e acolo ca omul să vadă diferența, nu ca opțiune bună). */
export const FONT_CHOICES_PX = [14, 16, 18, 20, 24, 28] as const;
/** Pasul 4: țintele apar pe rând, din ce în ce mai mici. */
export const TOUCH_TARGETS_PX = [72, 64, 56, 48, 40] as const;

/**
 * Pasul 5: ce îl deranjează pe site-uri, „cu desene și text” (specs/10): `icon` și `label` pe card, `summary` în
 * rezumatul de la final („fără …”).
 * Ordinea e cea din specs/10.
 */
export const DISLIKE_CHOICES: Record<PreferenceCategory, { label: string; summary: string; icon: string }> = {
  "ai-features": { label: "Rezumate și butoane AI", summary: "fără rezumate AI", icon: "🤖" },
  "short-video": { label: "Clipuri scurte", summary: "fără clipuri scurte", icon: "🎬" },
  stories: { label: "Stories", summary: "fără Stories", icon: "⭕" },
  promos: { label: "Bannere și promoții", summary: "fără bannere", icon: "📢" },
  clutter: { label: "Pagini aglomerate", summary: "pagini mai simple", icon: "🧩" },
  popups: { label: "Ferestre care apar", summary: "fără ferestre care apar", icon: "🪟" },
  autoplay: { label: "Redare automată", summary: "fără redare automată", icon: "▶️" },
};
export const DISLIKE_ORDER = Object.keys(DISLIKE_CHOICES) as PreferenceCategory[];

/**
 * Pasul 6: site-uri pe care omul le poate cunoaște, doar cu nume (fără logo-uri). D le poate schimba cu cele din demo;
 * `host` e cheia din profil (fără „www.”, litere mici).
 */
export const FAMILIAR_SITE_CHOICES: readonly { host: string; name: string }[] = [
  { host: "youtube.com", name: "YouTube" },
  { host: "google.com", name: "Google" },
  { host: "facebook.com", name: "Facebook" },
  { host: "instagram.com", name: "Instagram" },
  { host: "wikipedia.org", name: "Wikipedia" },
  { host: "emag.ro", name: "eMAG" },
];

/** Pasul 7. */
export const TECH_COMFORT_CHOICES: Record<Persona["techComfort"], string> = {
  low: "Puțin",
  medium: "Mediu",
  high: "Mult",
};

/** O țintă din testul de atingere. */
export interface TouchTrial {
  sizePx: number;
  firstTryHit: boolean;
  misses: number;
  ms: number;
  /** Cu tastatura (Enter/Space) nu se măsoară mărimea degetului: încercarea nu decide `minTargetPx`. */
  input: "pointer" | "keyboard";
}

/** Ce a răspuns omul; un pas omis rămâne nedefinit și nu schimbă profilul. */
export interface OnboardingAnswers {
  fontPx?: number;
  contrast?: "normal" | "high";
  touch?: TouchTrial[];
  dislikes?: PreferenceCategory[];
  familiarSites?: string[];
  techComfort?: Persona["techComfort"];
  prefersVoice?: boolean;
}

/** Testul pornește la prima deschidere: profil nici terminat, nici omis. */
export function needsOnboarding(profile: Pick<UserProfile, "onboarding">): boolean {
  return !profile.onboarding.completed && !profile.onboarding.skipped;
}

/** Fontul ales, niciodată sub minimul global. */
export function minFontFromChoice(fontPx: number): number {
  return Math.max(HARD_LIMITS.minFontPx, Math.ceil(fontPx));
}

/**
 * Cea mai mică țintă apăsată din prima, cu condiția ca toate țintele mai mari să fi fost apăsate din prima
 * (o nimereală norocoasă la 40px după o ratare la 56px nu contează). Niciuna din prima → cea mai mare țintă.
 * Rotunjită în sus și niciodată sub HARD_LIMITS.minTargetPx. Contează doar apăsările cu degetul sau mouse-ul;
 * fără niciuna (testul făcut cu tastatura), nu decide nimic.
 */
export function minTargetFromTouch(trials: TouchTrial[]): number | undefined {
  const measured = trials.filter((trial) => trial.input === "pointer");
  if (measured.length === 0) return undefined;
  const bySize = [...measured].sort((a, b) => b.sizePx - a.sizePx);
  let smallestReliable = bySize[0].sizePx;
  for (const trial of bySize) {
    if (!trial.firstTryHit) break;
    smallestReliable = trial.sizePx;
  }
  return Math.max(HARD_LIMITS.minTargetPx, Math.ceil(smallestReliable));
}

/**
 * Ce scrie omul la „alt site” → host-ul din profil: fără schemă, „www.”, cale sau port, cu litere mici.
 * `undefined` dacă nu arată a adresă de site (ex. „nu știu”).
 */
export function normalizeHost(input: string): string | undefined {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#:]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host) ? host : undefined;
}

export function skippedResult(): OnboardingResult {
  return { skipped: true, answers: [] };
}

export function buildOnboardingResult(answers: OnboardingAnswers): OnboardingResult {
  const result: OnboardingResult = { skipped: false, needs: {}, persona: {}, answers: [] };
  const { needs, persona } = result as Required<OnboardingResult>;

  if (answers.fontPx !== undefined) {
    needs.minFontPx = minFontFromChoice(answers.fontPx);
    result.answers.push({ questionId: "font", answer: answers.fontPx });
  }
  if (answers.contrast) {
    needs.contrast = answers.contrast;
    result.answers.push({ questionId: "contrast", answer: answers.contrast });
  }
  const minTarget = answers.touch ? minTargetFromTouch(answers.touch) : undefined;
  if (minTarget !== undefined) needs.minTargetPx = minTarget;
  // Toate măsurătorile ajung la server, și cele cu tastatura: agentul și adaptarea le pot citi din `answers`.
  for (const trial of answers.touch ?? []) {
    const id = `touch.${trial.sizePx}`;
    result.answers.push(
      { questionId: id, answer: trial.firstTryHit },
      { questionId: `${id}.misses`, answer: trial.misses },
      { questionId: `${id}.ms`, answer: trial.ms },
      { questionId: `${id}.input`, answer: trial.input },
    );
  }
  if (answers.dislikes && answers.dislikes.length > 0) {
    result.dislikes = [...answers.dislikes];
    result.answers.push({ questionId: "dislikes", answer: answers.dislikes.join(",") });
  }
  if (answers.familiarSites && answers.familiarSites.length > 0) {
    result.familiarSites = [...answers.familiarSites];
    result.answers.push({ questionId: "familiarSites", answer: answers.familiarSites.join(",") });
  }
  if (answers.techComfort) {
    persona.techComfort = answers.techComfort;
    result.answers.push({ questionId: "techComfort", answer: answers.techComfort });
  }
  if (answers.prefersVoice !== undefined) {
    needs.prefersVoice = answers.prefersVoice;
    result.answers.push({ questionId: "voice", answer: answers.prefersVoice });
  }
  return result;
}

/** Pasul 9: „Am pregătit așa: text de 20px, butoane mari, fără rezumate AI. Poți schimba oricând.” */
export function summaryText(result: OnboardingResult): string {
  const parts: string[] = [];
  const needs = result.needs ?? {};
  if (needs.minFontPx !== undefined) parts.push(`text de ${needs.minFontPx}px`);
  if (needs.contrast === "high") parts.push("contrast mare");
  if (needs.minTargetPx !== undefined) {
    parts.push(needs.minTargetPx > HARD_LIMITS.minTargetPx ? "butoane mari" : "butoane obișnuite");
  }
  for (const dislike of result.dislikes ?? []) parts.push(DISLIKE_CHOICES[dislike].summary);
  if (needs.prefersVoice) parts.push("îmi poți vorbi");
  if (parts.length === 0) return "Am păstrat site-urile cum sunt. Poți schimba oricând.";
  return `Am pregătit așa: ${parts.join(", ")}. Poți schimba oricând.`;
}
