// Verifică datele care vin din afară (HTTP, fișierele din data/, agentul) înainte să devină UserProfile.
// Nevoile se aduc mereu în limitele HARD_LIMITS: nimeni nu coboară fontul sau țintele sub minim (specs/07).

import {
  HARD_LIMITS,
  type LayoutTemplate,
  type NavPosition,
  type OnboardingResult,
  type Persona,
  type ProfileFact,
  type TrustState,
  type UserNeeds,
  type UserPreferences,
  type UserProfile,
} from "@uishapeshifter/contracts";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const LAYOUT_TEMPLATES: readonly LayoutTemplate[] = ["sidebar-feed", "bottom-nav-stories", "simple-tiles"];
const NAV_POSITIONS: readonly NavPosition[] = ["left", "top", "bottom"];
const AGE_RANGES: readonly NonNullable<Persona["ageRange"]>[] = ["18-34", "35-59", "60-74", "75+"];
const TECH_COMFORT: readonly Persona["techComfort"][] = ["low", "medium", "high"];
const FACT_SOURCES: readonly ProfileFact["source"][] = ["onboarding", "usage", "conversation"];
const CONTRAST: readonly UserNeeds["contrast"][] = ["normal", "high"];

/** userId ajunge în numele fișierului: doar litere, cifre și cratimă, ca să nu iasă din data/profiles/. */
const USER_ID_PATTERN = /^[a-z0-9-]{1,40}$/i;

export function isValidUserId(userId: string): boolean {
  return USER_ID_PATTERN.test(userId);
}

class InvalidProfile extends Error {}

function fail(field: string, expected: string): never {
  throw new InvalidProfile(`${field}: ${expected}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) fail(field, "trebuie să fie un obiect");
  return value;
}

function str(value: unknown, field: string): string {
  if (typeof value !== "string") fail(field, "trebuie să fie text");
  return value;
}

function optionalStr(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : str(value, field);
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") fail(field, "trebuie să fie true sau false");
  return value;
}

function num(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(field, "trebuie să fie un număr");
  return value;
}

function strings(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string"))
    fail(field, "trebuie să fie o listă de texte");
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    fail(field, `trebuie să fie una din ${allowed.join(", ")}`);
  }
  return value as T;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Aduce nevoile în limite: fontul între minim și maxim, țintele cel puțin minimul. */
export function clampNeeds(needs: UserNeeds): UserNeeds {
  return {
    ...needs,
    minFontPx: clamp(Math.round(needs.minFontPx), HARD_LIMITS.minFontPx, HARD_LIMITS.maxFontPx),
    minTargetPx: Math.max(HARD_LIMITS.minTargetPx, Math.round(needs.minTargetPx)),
  };
}

function parseNeeds(raw: unknown, field = "needs"): UserNeeds {
  const v = record(raw, field);
  return clampNeeds({
    minFontPx: num(v.minFontPx, `${field}.minFontPx`),
    contrast: oneOf(v.contrast, CONTRAST, `${field}.contrast`),
    minTargetPx: num(v.minTargetPx, `${field}.minTargetPx`),
    reducedMotion: bool(v.reducedMotion, `${field}.reducedMotion`),
    prefersVoice: bool(v.prefersVoice, `${field}.prefersVoice`),
  });
}

function parsePreferences(raw: unknown, field = "preferences"): UserPreferences {
  const v = record(raw, field);
  const familiarLayouts = strings(v.familiarLayouts, `${field}.familiarLayouts`);
  familiarLayouts.forEach((layout, i) => oneOf(layout, LAYOUT_TEMPLATES, `${field}.familiarLayouts[${i}]`));
  return {
    navPosition: v.navPosition === undefined ? undefined : oneOf(v.navPosition, NAV_POSITIONS, `${field}.navPosition`),
    template: v.template === undefined ? undefined : oneOf(v.template, LAYOUT_TEMPLATES, `${field}.template`),
    familiarLayouts: familiarLayouts as LayoutTemplate[],
    hiddenModules: strings(v.hiddenModules, `${field}.hiddenModules`),
    pinnedModules: strings(v.pinnedModules, `${field}.pinnedModules`),
  };
}

function parsePersona(raw: unknown, field = "persona"): Persona {
  const v = record(raw, field);
  return {
    ageRange: v.ageRange === undefined ? undefined : oneOf(v.ageRange, AGE_RANGES, `${field}.ageRange`),
    techComfort: oneOf(v.techComfort, TECH_COMFORT, `${field}.techComfort`),
    goals: strings(v.goals, `${field}.goals`),
    frequentTasks: strings(v.frequentTasks, `${field}.frequentTasks`),
    keyContacts: strings(v.keyContacts, `${field}.keyContacts`),
    painPoints: strings(v.painPoints, `${field}.painPoints`),
  };
}

/** Un fapt fără dovezi e refuzat (specs/08: „Dovezi obligatorii”). */
function parseFactUnsafe(raw: unknown, field: string): ProfileFact {
  const v = record(raw, field);
  const evidence = strings(v.evidence, `${field}.evidence`);
  if (evidence.length === 0) fail(`${field}.evidence`, "un fapt are nevoie de cel puțin o dovadă");
  const statement = str(v.statement, `${field}.statement`).trim();
  if (!statement) fail(`${field}.statement`, "nu poate fi gol");
  return {
    id: str(v.id, `${field}.id`),
    statement,
    evidence,
    confidence: clamp(num(v.confidence, `${field}.confidence`), 0, 1),
    source: oneOf(v.source, FACT_SOURCES, `${field}.source`),
    createdAt: str(v.createdAt, `${field}.createdAt`),
    lastConfirmedAt: optionalStr(v.lastConfirmedAt, `${field}.lastConfirmedAt`),
  };
}

function parseTrust(raw: unknown): TrustState {
  const v = record(raw, "trust");
  return {
    accepted: Math.max(0, Math.round(num(v.accepted, "trust.accepted"))),
    undone: Math.max(0, Math.round(num(v.undone, "trust.undone"))),
    autoApplyLowRisk: bool(v.autoApplyLowRisk, "trust.autoApplyLowRisk"),
  };
}

function parseProfileUnsafe(raw: unknown): UserProfile {
  const v = record(raw, "profil");
  const userId = str(v.userId, "userId");
  if (!isValidUserId(userId)) fail("userId", "doar litere, cifre și cratimă");
  const onboarding = record(v.onboarding, "onboarding");
  if (!Array.isArray(v.facts)) fail("facts", "trebuie să fie o listă");
  return {
    userId,
    displayName: str(v.displayName, "displayName"),
    createdAt: str(v.createdAt, "createdAt"),
    updatedAt: str(v.updatedAt, "updatedAt"),
    onboarding: {
      completed: bool(onboarding.completed, "onboarding.completed"),
      skipped: bool(onboarding.skipped, "onboarding.skipped"),
      at: optionalStr(onboarding.at, "onboarding.at"),
    },
    needs: parseNeeds(v.needs),
    preferences: parsePreferences(v.preferences),
    persona: parsePersona(v.persona),
    facts: v.facts.map((fact, i) => parseFactUnsafe(fact, `facts[${i}]`)),
    trust: parseTrust(v.trust),
  };
}

function guard<T>(parse: () => T): Parsed<T> {
  try {
    return { ok: true, value: parse() };
  } catch (error) {
    if (error instanceof InvalidProfile) return { ok: false, error: error.message };
    throw error;
  }
}

export function parseProfile(raw: unknown): Parsed<UserProfile> {
  return guard(() => parseProfileUnsafe(raw));
}

export function parseFact(raw: unknown, field = "fact"): Parsed<ProfileFact> {
  return guard(() => parseFactUnsafe(raw, field));
}

/** Rezultatul testului inițial: părțile sunt parțiale, deci se verifică doar câmpurile trimise. */
export function parseOnboardingResult(raw: unknown): Parsed<OnboardingResult> {
  return guard(() => {
    const v = record(raw, "onboarding");
    const answers = Array.isArray(v.answers) ? v.answers : fail("answers", "trebuie să fie o listă");
    return {
      skipped: bool(v.skipped, "skipped"),
      needs: v.needs === undefined ? undefined : (record(v.needs, "needs") as Partial<UserNeeds>),
      preferences:
        v.preferences === undefined ? undefined : (record(v.preferences, "preferences") as Partial<UserPreferences>),
      persona: v.persona === undefined ? undefined : (record(v.persona, "persona") as Partial<Persona>),
      answers: answers.map((answer, i) => {
        const a = record(answer, `answers[${i}]`);
        const value = a.answer;
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
          fail(`answers[${i}].answer`, "trebuie să fie text, număr sau true/false");
        }
        return { questionId: str(a.questionId, `answers[${i}].questionId`), answer: value };
      }),
    };
  });
}
