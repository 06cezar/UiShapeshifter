// Schimbările de profil: rezultatul testului inițial și unealta agentului `update_profile` (fapte + patch).
// Orice rezultat trece din nou prin validare, deci nu poate ieși un profil invalid sau sub HARD_LIMITS.

import { randomUUID } from "node:crypto";
import type { JsonPatchOp, OnboardingResult, ProfileFact, ToolArgs, UserProfile } from "@uishapeshifter/contracts";
import { parseFact, parseProfile, type Parsed } from "./validate";

/** Cu cât crește încrederea unui fapt confirmat din nou (specs/08). */
const CONFIRMATION_BOOST = 0.1;
const MAX_CONFIDENCE = 1;

/** Agentul poate schimba doar părțile acestea; trust, facts și onboarding au căile lor. */
const PATCHABLE_ROOTS = ["needs", "preferences", "persona"];
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function applyOnboarding(profile: UserProfile, result: OnboardingResult, now: string): Parsed<UserProfile> {
  if (result.skipped) {
    return parseProfile({ ...profile, onboarding: { completed: false, skipped: true, at: now } });
  }
  return parseProfile({
    ...profile,
    onboarding: { completed: true, skipped: false, at: now },
    needs: { ...profile.needs, ...result.needs },
    preferences: { ...profile.preferences, ...result.preferences },
    persona: { ...profile.persona, ...result.persona },
  });
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

  const draft = structuredClone({ ...profile, facts }) as unknown as Record<string, unknown>;
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
  return next;
}
