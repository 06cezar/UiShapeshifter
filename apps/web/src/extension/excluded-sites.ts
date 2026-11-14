// „Nu schimba acest site” (popup): site-urile pe care extensia nu atinge nimic. Fontul minim și ascunderile fără AI (C4)
// se aplică pe orice site; omul trebuie să le poată opri acolo unde îl încurcă (ex. un site de lucru).
// Pe un site exclus nu aplicăm singuri nimic (rețeta, preferințele de bază, ascunderile); chatul și mascota rămân.

export const EXCLUDED_SITES_KEY = "excludedSites";

export interface ExcludedStorage {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/** Lista din stocare; date din afară, deci păstrăm doar textele. */
export function excludedFrom(stored: Record<string, unknown>): string[] {
  const list = stored[EXCLUDED_SITES_KEY];
  return Array.isArray(list) ? list.filter((host): host is string => typeof host === "string") : [];
}

export async function isExcluded(storage: ExcludedStorage, host: string): Promise<boolean> {
  return excludedFrom(await storage.get(EXCLUDED_SITES_KEY)).includes(host);
}

/** Schimbă starea site-ului; întoarce noua stare (true = extensia nu-l mai atinge). */
export async function toggleExcluded(storage: ExcludedStorage, host: string): Promise<boolean> {
  const current = excludedFrom(await storage.get(EXCLUDED_SITES_KEY));
  const excluded = !current.includes(host);
  const next = excluded ? [...current, host].sort() : current.filter((h) => h !== host);
  await storage.set({ [EXCLUDED_SITES_KEY]: next });
  return excluded;
}
