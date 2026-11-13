// Profilul omului ținut și pe dispozitiv (E8, specs/08): chrome.storage.local, cheia = userId.
// Așa profilul rezistă la repornirea browserului și merge fără cont; serverul are aceeași copie, ca agentul să-l aibă
// în context. Service worker-ul îl aduce de pe server la pornire și după fiecare rulare (agentul poate să-l fi
// schimbat cu update_profile); dacă serverul a pornit de la zero, îi trimite copia locală înapoi.

import type { UserProfile } from "@uishapeshifter/contracts";

export interface ProfileStorage {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/** Cât de des încercăm din nou dacă serverul nu răspunde (pornește mai târziu decât browserul). */
export const PROFILE_RETRY_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Forma minimă ca să-l folosim; restul îl validează serverul (E1/E8) când îl primește. */
export function looksLikeProfile(value: unknown, userId: string): value is UserProfile {
  return (
    isRecord(value) &&
    value.userId === userId &&
    isRecord(value.needs) &&
    isRecord(value.onboarding) &&
    Array.isArray(value.facts) &&
    typeof value.updatedAt === "string"
  );
}

/** Profilul „de la zero” pe care îl creează serverul pentru un userId necunoscut: nimic învățat încă. */
export function isBlank(profile: UserProfile): boolean {
  return (
    !profile.onboarding.completed &&
    !profile.onboarding.skipped &&
    profile.facts.length === 0 &&
    (profile.generalPreferences ?? []).length === 0 &&
    (profile.familiarSites ?? []).length === 0
  );
}

export async function readLocalProfile(storage: ProfileStorage, userId: string): Promise<UserProfile | null> {
  const value = (await storage.get(userId))[userId];
  return looksLikeProfile(value, userId) ? value : null;
}

export interface ProfileSyncOptions {
  apiUrl: string;
  userId: string;
  storage: ProfileStorage;
  fetchFn?: typeof fetch;
}

export type SyncOutcome = "pulled" | "restored" | "offline";

/**
 * O trecere de sincronizare: aduce profilul de pe server și îl ține local; dacă serverul a pierdut profilul (pornit
 * de la zero) și noi avem unul, îl trimitem înapoi. Fără server, rămâne copia locală (`offline`).
 */
export async function syncProfile(options: ProfileSyncOptions): Promise<SyncOutcome> {
  const fetchFn = options.fetchFn ?? fetch;
  const url = `${options.apiUrl}/profile/${encodeURIComponent(options.userId)}`;
  const local = await readLocalProfile(options.storage, options.userId);

  let remote: unknown;
  try {
    const response = await fetchFn(url);
    if (!response.ok) return "offline";
    remote = await response.json();
  } catch {
    return "offline";
  }
  if (!looksLikeProfile(remote, options.userId)) return "offline";

  if (local && isBlank(remote) && !isBlank(local)) {
    try {
      const response = await fetchFn(url, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(local),
      });
      if (response.ok) {
        const restored: unknown = await response.json();
        if (looksLikeProfile(restored, options.userId)) {
          await options.storage.set({ [options.userId]: restored });
          return "restored";
        }
      }
    } catch {
      // serverul a căzut între timp: copia locală rămâne, încercăm la următoarea trecere
    }
    return "offline";
  }

  await options.storage.set({ [options.userId]: remote });
  return "pulled";
}
