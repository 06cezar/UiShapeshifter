// Unde stă rețeta unui site: chrome.storage.local, cheia „recipe:<host>”, valoarea { recipe, revisions } (specs/02).
// Stocarea e sursa adevărului: orice tab sau popup care o schimbă e auzit de toate tab-urile gazdei (onChanged).

import { emptyRecipe, type DomOp, type RecipeRevision, type SiteRecipe } from "@uishapeshifter/contracts";

export const RECIPE_KEY_PREFIX = "recipe:";

export interface StoredRecipe {
  recipe: SiteRecipe;
  revisions: RecipeRevision[];
}

/** Ce folosim din chrome.storage.local; în teste, un obiect în memorie. */
export interface RecipeStorage {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export function recipeKey(host: string): string {
  return `${RECIPE_KEY_PREFIX}${host}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Datele din stocare pot fi vechi sau stricate: le verificăm, altfel pornim de la o rețetă goală. */
export function parseStoredRecipe(value: unknown, host: string, now: string): StoredRecipe {
  if (isRecord(value) && isRecord(value.recipe) && Array.isArray(value.revisions)) {
    const r = value.recipe;
    if (
      r.host === host &&
      typeof r.revision === "number" &&
      typeof r.css === "string" &&
      typeof r.updatedAt === "string"
    ) {
      const revisions = value.revisions
        .filter(
          (rev): rev is RecipeRevision =>
            isRecord(rev) &&
            typeof rev.revision === "number" &&
            typeof rev.css === "string" &&
            typeof rev.reason === "string",
        )
        .map((rev) => withOps<RecipeRevision>(rev, rev.ops));
      const recipe = withOps<SiteRecipe>({ host, revision: r.revision, css: r.css, updatedAt: r.updatedAt }, r.ops);
      return { recipe, revisions };
    }
  }
  return { recipe: emptyRecipe(host, now), revisions: [] };
}

/**
 * `ops` (etapa 2) se păstrează doar dacă e o listă; rețetele din etapa 1 n-au `ops` și rămân neschimbate.
 * Fiecare operație o verifică motorul înainte s-o aplice, nu aici.
 */
function withOps<T extends { ops?: DomOp[] }>(target: T, ops: unknown): T {
  const { ops: _ignored, ...rest } = target;
  return (Array.isArray(ops) ? { ...rest, ops: ops as DomOp[] } : rest) as T;
}

export async function loadRecipe(storage: RecipeStorage, host: string, now: string): Promise<StoredRecipe> {
  const key = recipeKey(host);
  return parseStoredRecipe((await storage.get(key))[key], host, now);
}

export function saveRecipe(storage: RecipeStorage, stored: StoredRecipe): Promise<void> {
  return storage.set({ [recipeKey(stored.recipe.host)]: stored });
}

/** „Revino la original”: rețeta gazdei dispare cu totul, cu istoric cu tot. */
export function clearRecipe(storage: RecipeStorage, host: string): Promise<void> {
  return storage.remove(recipeKey(host));
}
