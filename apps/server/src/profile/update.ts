// Schimbările de profil: rezultatul testului inițial și unealta agentului `update_profile` (fapte + patch).
// Orice rezultat trece din nou prin validare, deci nu poate ieși un profil invalid sau sub HARD_LIMITS.

import { randomUUID } from "node:crypto";
import type {
  FamiliarSite,
  GeneralPreference,
  JsonPatchOp,
  OnboardingResult,
  PreferenceCategory,
  ProfileFact,
  ToolArgs,
  UserProfile,
} from "@uishapeshifter/contracts";
import { parseFact, parseProfile, type Parsed } from "./validate";

/** Cu cât crește încrederea unui fapt confirmat din nou (specs/08). */
const CONFIRMATION_BOOST = 0.1;
const MAX_CONFIDENCE = 1;

/**
 * Agentul poate schimba doar părțile acestea; trust, facts și onboarding au căile lor.
 * generalPreferences și familiarSites (E8): agentul adaugă „fără AI peste tot” cu add pe /generalPreferences/-.
 */
const PATCHABLE_ROOTS = ["needs", "preferences", "persona", "generalPreferences", "familiarSites"];

/** Cum spunem în profil o categorie aleasă la „ce te deranjează” în testul inițial (specs/10). */
const DISLIKE_TEXT: Record<PreferenceCategory, string> = {
  "ai-features": "fără rezumate și butoane AI",
  "short-video": "fără clipuri scurte (Shorts, Reels)",
  stories: "fără benzi de Stories",
  promos: "fără bannere și reclame",
  clutter: "fără aglomerație: doar ce folosesc",
  popups: "fără ferestre care apar peste pagină",
  autoplay: "fără redare automată",
};

/**
 * Aceeași preferință spusă de două ori nu apare de două ori: după categorie, altfel după text. Dovezile și site-urile
 * pe care s-a aplicat se adună; prima rămâne (id-ul ei e deja în rețete și în panou).
 */
export function mergeGeneralPreferences(list: GeneralPreference[]): GeneralPreference[] {
  const merged: GeneralPreference[] = [];
  for (const preference of list) {
    const same = merged.find((known) =>
      known.category && preference.category
        ? known.category === preference.category
        : sameStatement(known.text, preference.text),
    );
    if (!same) {
      merged.push({ ...preference, id: uniqueId(preference.id, merged) });
      continue;
    }
    same.evidence = [...new Set([...same.evidence, ...preference.evidence])];
    same.appliedOn = [...new Set([...same.appliedOn, ...preference.appliedOn])];
  }
  return merged;
}

function uniqueId(id: string, taken: GeneralPreference[]): string {
  let candidate = id;
  for (let n = 2; taken.some((p) => p.id === candidate); n++) candidate = `${id}-${n}`;
  return candidate;
}

/** Un site cunoscut apare o dată; „daily” bate „sometimes”. */
export function mergeFamiliarSites(list: FamiliarSite[]): FamiliarSite[] {
  const byHost = new Map<string, FamiliarSite>();
  for (const site of list) {
    const known = byHost.get(site.host);
    if (!known || (known.level === "sometimes" && site.level === "daily")) byHost.set(site.host, site);
  }
  return [...byHost.values()];
}
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function applyOnboarding(profile: UserProfile, result: OnboardingResult, now: string): Parsed<UserProfile> {
  if (result.skipped) {
    return parseProfile({ ...profile, onboarding: { completed: false, skipped: true, at: now } });
  }
  // „Ce te deranjează” → preferințe generale; „ce site-uri cunoști” → site-uri familiare (specs/08, specs/10).
  const fromDislikes: GeneralPreference[] = (result.dislikes ?? []).map((category) => ({
    id: category,
    category,
    text: DISLIKE_TEXT[category],
    source: "onboarding",
    evidence: [],
    createdAt: now,
    appliedOn: [],
  }));
  const fromSites: FamiliarSite[] = (result.familiarSites ?? []).map((host) => ({
    host,
    level: "daily",
    source: "onboarding",
  }));
  const parsed = parseProfile({
    ...profile,
    onboarding: { completed: true, skipped: false, at: now },
    needs: { ...profile.needs, ...result.needs },
    preferences: { ...profile.preferences, ...result.preferences },
    persona: { ...profile.persona, ...result.persona },
    generalPreferences: [...(profile.generalPreferences ?? []), ...fromDislikes],
    familiarSites: [...(profile.familiarSites ?? []), ...fromSites],
  });
  return parsed.ok ? { ok: true, value: tidy(parsed.value) } : parsed;
}

/** După orice schimbare: fără dubluri în preferințele generale și în site-urile familiare. */
function tidy(profile: UserProfile): UserProfile {
  return {
    ...profile,
    generalPreferences: mergeGeneralPreferences(profile.generalPreferences ?? []),
    familiarSites: mergeFamiliarSites(profile.familiarSites ?? []),
  };
}

function sameStatement(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Un fapt nou se adaugă; unul deja știut se confirmă: încrederea crește, dovezile se adună. */
function addOrConfirmFact(facts: ProfileFact[], fact: ProfileFact, now: string): ProfileFact[] {
  const known = facts.find((f) => sameStatement(f.statement, fact.statement));
  if (!known) return [...facts, fact];
  const confirmed: ProfileFact = {
    ...known,
    evidence: [...new Set([...known.evidence, ...fact.evidence])],
    confidence: Math.min(MAX_CONFIDENCE, known.confidence + CONFIRMATION_BOOST),
    lastConfirmedAt: now,
  };
  return facts.map((f) => (f === known ? confirmed : f));
}

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

/** Aplică o operație JSON Patch (add / replace / remove) pe un obiect deja copiat. */
function applyPatchOp(target: Record<string, unknown>, op: JsonPatchOp): string | undefined {
  const keys = op.path
    .split("/")
    .slice(1)
    .map((key) => key.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (!op.path.startsWith("/") || keys.length < 2 || !PATCHABLE_ROOTS.includes(keys[0]!)) {
    return `${op.path}: se pot schimba doar ${PATCHABLE_ROOTS.map((root) => `/${root}/…`).join(", ")}`;
  }
  if (keys.some((key) => FORBIDDEN_KEYS.has(key))) return `${op.path}: cale interzisă`;
  if (op.op !== "remove" && op.value === undefined) return `${op.path}: lipsește value`;

  const last = keys.pop()!;
  let parent: unknown = target;
  for (const key of keys) {
    parent = isContainer(parent) ? (parent as Record<string, unknown>)[key] : undefined;
    if (!isContainer(parent)) return `${op.path}: calea nu există`;
  }

  if (Array.isArray(parent)) {
    const index = last === "-" ? parent.length : Number(last);
    const maxIndex = op.op === "add" ? parent.length : parent.length - 1;
    if (!Number.isInteger(index) || index < 0 || index > maxIndex) return `${op.path}: index în afara listei`;
    if (op.op === "add") parent.splice(index, 0, op.value);
    else if (op.op === "replace") parent[index] = op.value;
    else parent.splice(index, 1);
    return undefined;
  }

  const object = parent as Record<string, unknown>;
  if (op.op === "remove") delete object[last];
  else object[last] = op.value;
  return undefined;
}

/**
 * Unealta `update_profile`. Faptele fără dovezi sunt refuzate, iar nevoile nu scad din partea agentului:
 * minFontPx și minTargetPx scad doar dacă omul o cere explicit (PUT din Setări), nu prin agent (specs/08).
 */
export function applyProfileUpdate(
  profile: UserProfile,
  args: ToolArgs["update_profile"],
  now: string,
): Parsed<UserProfile> {
  let facts = profile.facts;
  for (const [i, raw] of (args.facts ?? []).entries()) {
    const parsed = parseFact({ ...raw, id: `fact-${randomUUID().slice(0, 8)}`, createdAt: now }, `facts[${i}]`);
    if (!parsed.ok) return parsed;
    facts = addOrConfirmFact(facts, parsed.value, now);
  }

  // Profilurile vechi n-au listele noi: le creăm goale, ca „add pe /generalPreferences/-” să aibă unde adăuga.
  const draft = structuredClone({
    ...profile,
    facts,
    generalPreferences: profile.generalPreferences ?? [],
    familiarSites: profile.familiarSites ?? [],
  }) as unknown as Record<string, unknown>;
  for (const op of args.patch ?? []) {
    const error = applyPatchOp(draft, op);
    if (error) return { ok: false, error };
  }

  const next = parseProfile(draft);
  if (!next.ok) return next;
  if (next.value.needs.minFontPx < profile.needs.minFontPx) {
    return { ok: false, error: "needs.minFontPx: agentul nu poate micșora fontul minim" };
  }
  if (next.value.needs.minTargetPx < profile.needs.minTargetPx) {
    return { ok: false, error: "needs.minTargetPx: agentul nu poate micșora țintele" };
  }
  return { ok: true, value: tidy(next.value) };
}
