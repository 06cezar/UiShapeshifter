// Din răspunsurile testului inițial la OnboardingResult (specs/10, coloana „Rezultat”).
// Funcții pure: ecranele adună răspunsurile, aici se decid valorile din profil.

import { HARD_LIMITS } from "@uishapeshifter/contracts";
import type { LayoutTemplate, NavPosition, OnboardingResult, UserProfile } from "@uishapeshifter/contracts";

/** Pasul 2: aceeași propoziție la mărimile astea (14px e acolo ca omul să vadă diferența, nu ca opțiune bună). */
export const FONT_CHOICES_PX = [14, 16, 18, 20, 24, 28] as const;
/** Pasul 4: țintele apar pe rând, din ce în ce mai mici. */
export const TOUCH_TARGETS_PX = [72, 64, 56, 48, 40] as const;

/**
 * Pasul 5: cardurile „Ce folosești”, cu modulele pe care le fixăm și sarcina din `persona.frequentTasks`.
 * Sarcinile sunt acțiuni în formatul din contract (`"openChat:ana"`, `"sendPhoto"`), fără contact: testul nu știe încă
 * cu cine vorbește omul.
 */
export const TASK_CHOICES = {
  messages: { label: "Mesaje", modules: ["messages"], task: "sendMessage" },
  photos: { label: "Poze", modules: ["photos"], task: "sendPhoto" },
  calls: { label: "Apeluri", modules: ["calls", "contacts"], task: "call" },
  news: { label: "Noutăți de la alții", modules: ["feed", "stories"], task: "readNews" },
} as const satisfies Record<string, { label: string; modules: readonly string[]; task: string }>;
export type TaskChoice = keyof typeof TASK_CHOICES;

export const LAYOUT_CHOICES: readonly LayoutTemplate[] = ["sidebar-feed", "bottom-nav-stories", "simple-tiles"];
export const NAV_CHOICES: readonly NavPosition[] = ["bottom", "top", "left"];
/** „meniul jos”; pe butoane se scrie cu majusculă. */
export const NAV_NAMES: Record<NavPosition, string> = { bottom: "jos", top: "sus", left: "în stânga" };

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
  tasks?: TaskChoice[];
  layout?: LayoutTemplate;
  navPosition?: NavPosition;
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

export function pinnedModulesFor(tasks: TaskChoice[]): string[] {
  return unique(tasks.flatMap((task) => TASK_CHOICES[task].modules));
}

export function skippedResult(): OnboardingResult {
  return { skipped: true, answers: [] };
}

export function buildOnboardingResult(answers: OnboardingAnswers): OnboardingResult {
  const result: OnboardingResult = { skipped: false, needs: {}, preferences: {}, persona: {}, answers: [] };
  const { needs, preferences, persona } = result as Required<OnboardingResult>;

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
  if (answers.tasks && answers.tasks.length > 0) {
    persona.frequentTasks = unique(answers.tasks.map((choice) => TASK_CHOICES[choice].task));
    preferences.pinnedModules = pinnedModulesFor(answers.tasks);
    result.answers.push({ questionId: "tasks", answer: answers.tasks.join(",") });
  }
  if (answers.layout) {
    preferences.familiarLayouts = [answers.layout];
    preferences.template = answers.layout;
    result.answers.push({ questionId: "layout", answer: answers.layout });
  }
  if (answers.navPosition) {
    preferences.navPosition = answers.navPosition;
    result.answers.push({ questionId: "nav", answer: answers.navPosition });
  }
  if (answers.prefersVoice !== undefined) {
    needs.prefersVoice = answers.prefersVoice;
    result.answers.push({ questionId: "voice", answer: answers.prefersVoice });
  }
  return result;
}

/** Pasul 9: „Am pregătit aplicația așa: text de 20px, butoane mari, meniul jos. Poți schimba oricând.” */
export function summaryText(result: OnboardingResult): string {
  const parts: string[] = [];
  const needs = result.needs ?? {};
  if (needs.minFontPx !== undefined) parts.push(`text de ${needs.minFontPx}px`);
  if (needs.contrast === "high") parts.push("contrast mare");
  if (needs.minTargetPx !== undefined) {
    parts.push(needs.minTargetPx > HARD_LIMITS.minTargetPx ? "butoane mari" : "butoane obișnuite");
  }
  const nav = result.preferences?.navPosition;
  if (nav) parts.push(`meniul ${NAV_NAMES[nav]}`);
  if (needs.prefersVoice) parts.push("îmi poți vorbi");
  if (parts.length === 0) return "Am păstrat aplicația obișnuită. Poți schimba oricând.";
  return `Am pregătit aplicația așa: ${parts.join(", ")}. Poți schimba oricând.`;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
