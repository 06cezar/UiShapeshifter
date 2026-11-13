// Profilul pe server (specs/06): citit la pornire, ca să știm dacă arătăm testul, și trimis la final.

import type { OnboardingResult, UserProfile } from "@uishapeshifter/contracts";
import { API_URL } from "../server-url";

/** Cât din profil verificăm înainte să-l folosim: doar ce citește testul. Restul îl validează serverul (E1). */
type CheckedProfile = Pick<UserProfile, "userId" | "onboarding"> & Partial<UserProfile>;

export async function fetchProfile(userId: string, fetchFn: typeof fetch = fetch): Promise<UserProfile> {
  const res = await fetchFn(`${API_URL}/profile/${encodeURIComponent(userId)}`);
  return readProfile(res) as Promise<UserProfile>;
}

export async function submitOnboarding(
  userId: string,
  result: OnboardingResult,
  fetchFn: typeof fetch = fetch,
): Promise<UserProfile> {
  const res = await fetchFn(`${API_URL}/profile/${encodeURIComponent(userId)}/onboarding`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
  return readProfile(res) as Promise<UserProfile>;
}

async function readProfile(res: Response): Promise<CheckedProfile> {
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const reason = isRecord(body) && typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
    throw new Error(`Serverul n-a primit profilul: ${reason}`);
  }
  if (!isProfile(body)) throw new Error("Serverul a trimis un profil pe care nu-l înțeleg.");
  return body;
}

function isProfile(value: unknown): value is CheckedProfile {
  if (!isRecord(value) || typeof value.userId !== "string" || !isRecord(value.onboarding)) return false;
  return typeof value.onboarding.completed === "boolean" && typeof value.onboarding.skipped === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
