// Profilurile cu care pornește un utilizator: `maria` (profilul de demo din specs/08) și unul gol pentru restul,
// inclusiv `demo-fresh`, care trebuie să treacă prin testul inițial.

import { DEFAULT_PROFILE_NEEDS, type UserProfile } from "@uishapeshifter/contracts";

export const DEMO_USER_ID = "maria";
export const FRESH_USER_ID = "demo-fresh";

export function createEmptyProfile(userId: string, now: string): UserProfile {
  return {
    userId,
    displayName: userId === FRESH_USER_ID ? "Prieten nou" : userId,
    createdAt: now,
    updatedAt: now,
    onboarding: { completed: false, skipped: false },
    needs: { ...DEFAULT_PROFILE_NEEDS },
    preferences: { familiarLayouts: [], hiddenModules: [], pinnedModules: [] },
    persona: { techComfort: "medium", goals: [], frequentTasks: [], keyContacts: [], painPoints: [] },
    facts: [],
    trust: { accepted: 0, undone: 0, autoApplyLowRisk: false },
    generalPreferences: [],
    familiarSites: [],
  };
}

/** Maria, exact ca în specs/08: a făcut testul inițial, are nevoie de text mare, contrast și ținte mari. */
export function createMariaProfile(now: string): UserProfile {
  return {
    userId: DEMO_USER_ID,
    displayName: "Maria",
    createdAt: now,
    updatedAt: now,
    onboarding: { completed: true, skipped: false, at: now },
    needs: { minFontPx: 20, contrast: "high", minTargetPx: 56, reducedMotion: false, prefersVoice: true },
    preferences: {
      navPosition: "bottom",
      familiarLayouts: ["bottom-nav-stories"],
      hiddenModules: [],
      pinnedModules: ["messages"],
    },
    persona: {
      ageRange: "60-74",
      techComfort: "low",
      goals: ["vorbesc cu nepoata Ana", "văd pozele de la familie"],
      frequentTasks: ["openChat:ana", "call:ana", "sendPhoto"],
      keyContacts: ["ana", "ion"],
      painPoints: ["nu găsesc butonul de atașat poza"],
    },
    facts: [],
    trust: { accepted: 0, undone: 0, autoApplyLowRisk: false },
    generalPreferences: [],
    familiarSites: [],
  };
}

/** Profilul de la care pornește un utilizator nou (sau unul resetat). */
export function createStartingProfile(userId: string, now: string): UserProfile {
  return userId === DEMO_USER_ID ? createMariaProfile(now) : createEmptyProfile(userId, now);
}
