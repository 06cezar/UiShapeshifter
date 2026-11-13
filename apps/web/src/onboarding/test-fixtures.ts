// Date comune pentru testele din onboarding/: un profil complet, ca cel întors de serverul real (E1).
// Doar pentru teste.

import { DEFAULT_PROFILE_NEEDS } from "@uishapeshifter/contracts";
import type { UserProfile } from "@uishapeshifter/contracts";

export function testProfile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: "demo-fresh",
    displayName: "Prieten nou",
    createdAt: "2026-11-13T18:00:00.000Z",
    updatedAt: "2026-11-13T18:00:00.000Z",
    onboarding: { completed: false, skipped: false },
    needs: { ...DEFAULT_PROFILE_NEEDS },
    preferences: { familiarLayouts: [], hiddenModules: [], pinnedModules: [] },
    persona: { techComfort: "medium", goals: [], frequentTasks: [], keyContacts: [], painPoints: [] },
    facts: [],
    trust: { accepted: 0, undone: 0, autoApplyLowRisk: false },
    ...over,
  };
}
