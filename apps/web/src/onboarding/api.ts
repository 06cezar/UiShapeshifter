// Profilul pe server (specs/06): citit la pornire, ca să știm dacă arătăm testul, și trimis la final.
// Erorile aruncate aici sunt pentru consolă; omul vede un text fix în română (Onboarding.tsx).

import type { OnboardingResult, UserProfile } from "@uishapeshifter/contracts";
import { API_URL } from "../server-url";

/** Cât așteptăm profilul la pornire: un server care nu răspunde nu are voie să țină omul pe loc. */
export const PROFILE_TIMEOUT_MS = 5000;
/** Cât așteptăm salvarea: un server care atârnă nu are voie să țină omul pe „Salvez…”, cu „Omite” blocat. */
export const SUBMIT_TIMEOUT_MS = 10_000;

export async function fetchProfile(
  userId: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs: number = PROFILE_TIMEOUT_MS,
): Promise<UserProfile> {
  const res = await fetchFn(`${API_URL}/profile/${encodeURIComponent(userId)}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  return readProfile(res);
}

export async function submitOnboarding(
  userId: string,
  result: OnboardingResult,
  fetchFn: typeof fetch = fetch,
  timeoutMs: number = SUBMIT_TIMEOUT_MS,
): Promise<UserProfile> {
  const res = await fetchFn(`${API_URL}/profile/${encodeURIComponent(userId)}/onboarding`, {
    method: "PUT",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
  return readProfile(res);
}

async function readProfile(res: Response): Promise<UserProfile> {
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const reason = isRecord(body) && typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
    throw new Error(`profil: serverul a răspuns ${res.status}: ${reason}`);
  }
  if (!isProfile(body)) throw new Error("profil: răspunsul nu are forma UserProfile");
  return body;
}

/**
 * Forma lui UserProfile, verificată cât folosește interfața: onboarding-ul, nevoile (de aici vin pragurile)
 * și părțile care trebuie să fie obiecte sau liste. Valorile le-a validat deja serverul (E1).
 */
export function isProfile(value: unknown): value is UserProfile {
  if (!isRecord(value) || typeof value.userId !== "string" || typeof value.displayName !== "string") return false;
  const { onboarding, needs } = value;
  if (!isRecord(onboarding) || typeof onboarding.completed !== "boolean" || typeof onboarding.skipped !== "boolean") {
    return false;
  }
  if (
    !isRecord(needs) ||
    typeof needs.minFontPx !== "number" ||
    typeof needs.minTargetPx !== "number" ||
    (needs.contrast !== "normal" && needs.contrast !== "high") ||
    typeof needs.reducedMotion !== "boolean" ||
    typeof needs.prefersVoice !== "boolean"
  ) {
    return false;
  }
  return isRecord(value.preferences) && isRecord(value.persona) && isRecord(value.trust) && Array.isArray(value.facts);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
