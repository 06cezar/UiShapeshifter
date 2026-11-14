// Contul opțional în extensie (E6, specs/08): intrarea în cont, descărcarea datelor, trimiterea lor după schimbări.
// Fără cont nimic nu pleacă nicăieri în afară de serverul agentului; cu cont, profilul și rețetele trec pe alt dispozitiv.
// Token-ul stă în chrome.storage.local; parola nu se păstrează nicăieri în extensie.

import type { AuthResult, SiteRecipe, SiteRecipeHistory, SyncBundle, UserProfile } from "@uishapeshifter/contracts";
import { USER_ID_KEY } from "../extension/base-needs";
import { RECIPE_KEY_PREFIX, recipeKey, type StoredRecipe } from "../ui/recipes/recipe-store";

/** Cheia contului în chrome.storage.local: { token, account, userId }. */
export const ACCOUNT_KEY = "account";
/** userId-ul activ (E5): după login devine cel al contului. Aceeași cheie ca în base-needs.ts. */
export { USER_ID_KEY };
/** După o schimbare, așteptăm puțin înainte să trimitem (specs/08: „cu pauză de 2 s”). */
export const PUSH_DELAY_MS = 2000;

export interface SyncStorage {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export interface SyncOptions {
  apiUrl: string;
  storage: SyncStorage;
  fetchFn?: typeof fetch;
}

export type AccountOutcome = { ok: true; auth: AuthResult } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function currentAccount(storage: SyncStorage): Promise<AuthResult | null> {
  const value = (await storage.get(ACCOUNT_KEY))[ACCOUNT_KEY];
  return isRecord(value) && typeof value.token === "string" && typeof value.userId === "string"
    ? (value as unknown as AuthResult)
    : null;
}

/**
 * Intră în cont sau îl creează. userId-ul anonim de pe dispozitiv merge la server: la înregistrare datele lui devin ale
 * contului, la login se îmbină. Apoi descărcăm tot ce are contul.
 */
export async function signIn(
  mode: "register" | "login",
  username: string,
  password: string,
  options: SyncOptions,
): Promise<AccountOutcome> {
  const fetchFn = options.fetchFn ?? fetch;
  const anonymousUserId = (await options.storage.get(USER_ID_KEY))[USER_ID_KEY];
  // Ce a schimbat omul local înainte să intre în cont trebuie să fie pe server înainte de îmbinare.
  if (typeof anonymousUserId === "string") await pushAnonymous(anonymousUserId, options);
  let response: Response;
  try {
    response = await fetchFn(`${options.apiUrl}/accounts/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password, anonymousUserId }),
    });
  } catch {
    return { ok: false, error: "Serverul nu răspunde. Încearcă puțin mai târziu." };
  }
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok || !isRecord(body) || typeof body.token !== "string" || typeof body.userId !== "string") {
    return { ok: false, error: isRecord(body) && typeof body.error === "string" ? body.error : "Nu a mers." };
  }
  const auth = body as unknown as AuthResult;
  await options.storage.set({ [ACCOUNT_KEY]: auth, [USER_ID_KEY]: auth.userId });
  await pull(options);
  return { ok: true, auth };
}

/** „Ieși din cont”: token-ul pleacă, datele de pe dispozitiv rămân (specs/08, pasul 6). */
export async function signOut(storage: SyncStorage): Promise<void> {
  await storage.remove(ACCOUNT_KEY);
}

/** Datele locale: profilul (sub userId), rețetele (recipe:<host>) și istoricul lor (pentru „Anulez” pe o cerere). */
async function localBundle(
  storage: SyncStorage,
  userId: string,
): Promise<{ profile?: UserProfile; recipes: SiteRecipe[]; history: SiteRecipeHistory[] }> {
  const all = await storage.get(null);
  const profile = isRecord(all[userId]) ? (all[userId] as unknown as UserProfile) : undefined;
  const stored = Object.entries(all)
    .filter(([key, value]) => key.startsWith(RECIPE_KEY_PREFIX) && isRecord(value) && isRecord(value.recipe))
    .map(([, value]) => value as unknown as StoredRecipe)
    .filter((entry) => entry.recipe.revision > 0);
  const history = stored
    .filter((entry) => Array.isArray(entry.revisions) && entry.revisions.length > 0)
    .map((entry) => ({ host: entry.recipe.host, revisions: entry.revisions }));
  return { profile, recipes: stored.map((entry) => entry.recipe), history };
}

/** Înainte de login: rețetele anonime ajung pe server (A5), ca îmbinarea să le găsească. */
async function pushAnonymous(userId: string, options: SyncOptions): Promise<void> {
  const fetchFn = options.fetchFn ?? fetch;
  const { recipes } = await localBundle(options.storage, userId);
  for (const recipe of recipes) {
    await fetchFn(`${options.apiUrl}/recipes/${encodeURIComponent(userId)}/${encodeURIComponent(recipe.host)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(recipe),
    }).catch(() => undefined);
  }
}

/** Descarcă ce are contul: profilul sub userId-ul contului, rețetele mai noi decât cele locale. */
export async function pull(options: SyncOptions): Promise<boolean> {
  const auth = await currentAccount(options.storage);
  if (!auth) return false;
  const fetchFn = options.fetchFn ?? fetch;
  let bundle: SyncBundle;
  try {
    const response = await fetchFn(`${options.apiUrl}/sync`, { headers: { authorization: `Bearer ${auth.token}` } });
    if (!response.ok) return false;
    bundle = (await response.json()) as SyncBundle;
  } catch {
    return false;
  }
  const local = await localBundle(options.storage, auth.userId);
  const items: Record<string, unknown> = { [auth.userId]: bundle.profile };
  for (const recipe of bundle.recipes ?? []) {
    const mine = local.recipes.find((r) => r.host === recipe.host);
    if (mine && Date.parse(mine.updatedAt) >= Date.parse(recipe.updatedAt)) continue; // cea locală e mai nouă
    const revisions = bundle.history?.find((entry) => entry.host === recipe.host)?.revisions ?? [];
    items[recipeKey(recipe.host)] = { recipe, revisions } satisfies StoredRecipe;
  }
  await options.storage.set(items);
  return true;
}

/** Trimite ce e pe dispozitiv; serverul îmbină (nu suprascrie). */
export async function push(options: SyncOptions): Promise<boolean> {
  const auth = await currentAccount(options.storage);
  if (!auth) return false;
  const { profile, recipes, history } = await localBundle(options.storage, auth.userId);
  if (!profile) return false;
  const fetchFn = options.fetchFn ?? fetch;
  try {
    const response = await fetchFn(`${options.apiUrl}/sync`, {
      method: "PUT",
      headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json" },
      body: JSON.stringify({ profile, recipes, history, updatedAt: new Date().toISOString() } satisfies SyncBundle),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Ce schimbări din stocare merită trimise: rețetele și profilul contului (nu token-ul, nu sesiunea). */
export function changeNeedsPush(changedKeys: string[], userId: string | undefined): boolean {
  return changedKeys.some((key) => key.startsWith(RECIPE_KEY_PREFIX) || (userId !== undefined && key === userId));
}
