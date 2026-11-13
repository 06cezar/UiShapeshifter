// Îmbinarea datelor la login pe alt dispozitiv și la sincronizare (specs/08, „Conturi” pasul 4):
// - rețetele: per site, câștigă cea cu `updatedAt` mai nou;
// - profilul: faptele, preferințele generale și site-urile cunoscute se unesc; nevoile iau valoarea MAI MARE
//   (nu coborâm un font minim la îmbinare); încrederea și testul inițial: ce știe oricare dintre ele.

import type { ProfileFact, SiteRecipe, UserNeeds, UserProfile } from "@uishapeshifter/contracts";
import { mergeFamiliarSites, mergeGeneralPreferences } from "../profile/update";

function mergeNeeds(a: UserNeeds, b: UserNeeds): UserNeeds {
  return {
    minFontPx: Math.max(a.minFontPx, b.minFontPx),
    minTargetPx: Math.max(a.minTargetPx, b.minTargetPx),
    contrast: a.contrast === "high" || b.contrast === "high" ? "high" : "normal",
    reducedMotion: a.reducedMotion || b.reducedMotion,
    prefersVoice: a.prefersVoice || b.prefersVoice,
  };
}

function mergeFacts(a: ProfileFact[], b: ProfileFact[]): ProfileFact[] {
  const merged = [...a];
  for (const fact of b) {
    const same = merged.find((known) => known.statement.trim().toLowerCase() === fact.statement.trim().toLowerCase());
    if (!same) merged.push(fact);
    else {
      same.evidence = [...new Set([...same.evidence, ...fact.evidence])];
      same.confidence = Math.max(same.confidence, fact.confidence);
    }
  }
  return merged;
}

const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];

/** `base` e profilul contului; `other` vine de pe dispozitiv. userId-ul și numele rămân ale contului. */
export function mergeProfiles(base: UserProfile, other: UserProfile, now: string): UserProfile {
  return {
    ...base,
    updatedAt: now,
    onboarding: base.onboarding.completed || base.onboarding.skipped ? base.onboarding : other.onboarding,
    needs: mergeNeeds(base.needs, other.needs),
    preferences: {
      ...other.preferences,
      ...base.preferences,
      familiarLayouts: [...new Set([...base.preferences.familiarLayouts, ...other.preferences.familiarLayouts])],
      hiddenModules: union(base.preferences.hiddenModules, other.preferences.hiddenModules),
      pinnedModules: union(base.preferences.pinnedModules, other.preferences.pinnedModules),
    },
    persona: {
      ...base.persona,
      goals: union(base.persona.goals, other.persona.goals),
      frequentTasks: union(base.persona.frequentTasks, other.persona.frequentTasks),
      keyContacts: union(base.persona.keyContacts, other.persona.keyContacts),
      painPoints: union(base.persona.painPoints, other.persona.painPoints),
    },
    facts: mergeFacts(structuredClone(base.facts), other.facts),
    trust: {
      accepted: Math.max(base.trust.accepted, other.trust.accepted),
      undone: Math.max(base.trust.undone, other.trust.undone),
      autoApplyLowRisk: base.trust.autoApplyLowRisk && other.trust.autoApplyLowRisk,
    },
    generalPreferences: mergeGeneralPreferences([
      ...structuredClone(base.generalPreferences ?? []),
      ...(other.generalPreferences ?? []),
    ]),
    familiarSites: mergeFamiliarSites([...(base.familiarSites ?? []), ...(other.familiarSites ?? [])]),
  };
}

/** Per site, rețeta mai nouă câștigă; site-urile care există doar într-o parte rămân. */
export function mergeRecipes(a: SiteRecipe[], b: SiteRecipe[]): SiteRecipe[] {
  const byHost = new Map<string, SiteRecipe>();
  for (const recipe of [...a, ...b]) {
    const known = byHost.get(recipe.host);
    if (!known || Date.parse(recipe.updatedAt) > Date.parse(known.updatedAt)) byHost.set(recipe.host, recipe);
  }
  return [...byHost.values()].sort((x, y) => x.host.localeCompare(y.host));
}
