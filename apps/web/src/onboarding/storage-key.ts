import type { OnboardingResult, UserProfile } from "@uishapeshifter/contracts";

// Cheia rezultatului testului în chrome.storage.local: din ea citesc profilul local și preferințele de bază (C4),
// ca extensia să meargă și fără server.
export const ONBOARDING_STORAGE_KEY = "onboarding";

/**
 * Ce scrie pagina testului în chrome.storage.local la final: rezultatul (cheia `onboarding`) și, dacă serverul a
 * răspuns, profilul întors de el sub userId, cheia profilului local (E8, specs/08). Fără profil scris imediat,
 * preferințele de bază ar citi încă profilul gol de dinainte de test și paginile ar vedea valorile implicite.
 */
export function localWritesAfterTest(
  userId: string,
  result: OnboardingResult,
  profile: UserProfile | null,
): Record<string, unknown> {
  return profile ? { [ONBOARDING_STORAGE_KEY]: result, [userId]: profile } : { [ONBOARDING_STORAGE_KEY]: result };
}
