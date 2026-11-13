// Uneltele pentru demo (E4, specs/12): „Resetează demo-ul” (profil, rețete, cont, test inițial) și profilul de demo
// din specs/08 (text de 20px, contrast mare, „fără rezumate AI”, „fără clipuri scurte”). Doar date de test.

import type { OnboardingResult } from "@uishapeshifter/contracts";
import { RECIPE_KEY_PREFIX } from "../ui/recipes/recipe-store";

export const ONBOARDING_KEY = "onboarding";
export const ACCOUNT_KEY = "account";
export const USER_ID_KEY = "userId";

/** Profilul de demo (specs/08, „Profil de demo”): îl încărcăm ca rezultat al testului inițial. */
export const DEMO_ONBOARDING: OnboardingResult = {
  skipped: false,
  needs: { minFontPx: 20, contrast: "high", minTargetPx: 56 },
  dislikes: ["ai-features", "short-video"],
  familiarSites: ["youtube.com"],
  answers: [{ questionId: "demo", answer: "profilul de demo (E4)" }],
};

export interface DemoStorage {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export interface DemoOptions {
  apiUrl: string;
  storage: DemoStorage;
  fetchFn?: typeof fetch;
}

/**
 * Totul ca la instalare, pentru o nouă trecere prin demo: rețetele (local și pe server), profilul (serverul îl refă de
 * la zero), contul și rezultatul testului inițial. userId-ul anonim rămâne, ca serverul să recunoască dispozitivul.
 * Fără server, curăță măcar ce e local (demo-ul fără rețea, cu AGENT_FAKE=1).
 */
export async function resetDemo(options: DemoOptions): Promise<{ recipes: number; server: boolean }> {
  const fetchFn = options.fetchFn ?? fetch;
  const all = await options.storage.get(null);
  const userId = typeof all[USER_ID_KEY] === "string" ? (all[USER_ID_KEY] as string) : undefined;
  const recipeKeys = Object.keys(all).filter((key) => key.startsWith(RECIPE_KEY_PREFIX));

  let server = false;
  if (userId) {
    const user = encodeURIComponent(userId);
    try {
      const reset = await fetchFn(`${options.apiUrl}/profile/${user}`, { method: "DELETE" });
      server = reset.ok;
      for (const key of recipeKeys) {
        const host = encodeURIComponent(key.slice(RECIPE_KEY_PREFIX.length));
        await fetchFn(`${options.apiUrl}/recipes/${user}/${host}`, { method: "DELETE" });
      }
    } catch {
      server = false; // serverul nu răspunde: curățăm măcar local
    }
  }
  await options.storage.remove([...recipeKeys, ONBOARDING_KEY, ACCOUNT_KEY, ...(userId ? [userId] : [])]);
  return { recipes: recipeKeys.length, server };
}

/** Încarcă profilul de demo: local (fontul minim se aplică imediat) și pe server (agentul îl vede în context). */
export async function loadDemoProfile(options: DemoOptions): Promise<boolean> {
  const fetchFn = options.fetchFn ?? fetch;
  await options.storage.set({ [ONBOARDING_KEY]: DEMO_ONBOARDING });
  const userId = (await options.storage.get(USER_ID_KEY))[USER_ID_KEY];
  if (typeof userId !== "string") return false;
  try {
    const response = await fetchFn(`${options.apiUrl}/profile/${encodeURIComponent(userId)}/onboarding`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(DEMO_ONBOARDING),
    });
    if (!response.ok) return false;
    await options.storage.set({ [userId]: await response.json() });
    return true;
  } catch {
    return false;
  }
}
