// Istoricul rețetelor la sincronizare (cererea lui C, #73): „Anulez” pe o cerere din istoric are nevoie de revizii,
// iar /api/recipes (A5) ține doar rețeta. Un fișier pe cont: data/history/<userId>.json.

import type { SiteRecipe, SiteRecipeHistory } from "@uishapeshifter/contracts";
import { dataPath, isSafeHost, isSafeId, readJson, writeJson } from "../storage/json-files";

const HISTORY_DIR = "history";
/** Cât istoric păstrăm pe site: destul pentru „Anulez” pe cererile din seara asta, fără fișiere uriașe. */
export const MAX_REVISIONS_PER_HOST = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRevision(value: unknown): boolean {
  return (
    isRecord(value) &&
    Number.isInteger(value.revision) &&
    typeof value.css === "string" &&
    typeof value.reason === "string" &&
    typeof value.at === "string" &&
    (value.ops === undefined || Array.isArray(value.ops))
  );
}

/** Forma istoricului venit din extensie; întoarce motivul, pentru mesajul 400. */
export function checkHistory(value: unknown): string | null {
  if (value === undefined) return null; // clienții vechi nu-l trimit
  if (!Array.isArray(value)) return "history trebuie să fie o listă.";
  for (const [i, entry] of value.entries()) {
    if (!isRecord(entry) || typeof entry.host !== "string" || !isSafeHost(entry.host)) {
      return `history[${i}]: host lipsește sau nu e valid.`;
    }
    if (!Array.isArray(entry.revisions) || !entry.revisions.every(isRevision)) {
      return `history[${i}]: revisions nu are forma RecipeRevision.`;
    }
  }
  return null;
}

export async function loadHistory(userId: string): Promise<SiteRecipeHistory[]> {
  if (!isSafeId(userId)) return [];
  const value = await readJson(dataPath(HISTORY_DIR, `${userId}.json`));
  return checkHistory(value) === null && Array.isArray(value) ? (value as SiteRecipeHistory[]) : [];
}

/**
 * Istoricul unui site merge cu rețeta care a câștigat la îmbinare: dacă rețeta trimisă e cea păstrată, îi luăm și
 * istoricul; altfel rămâne cel de pe server.
 */
export function mergeHistory(
  stored: SiteRecipeHistory[],
  incoming: SiteRecipeHistory[],
  incomingRecipes: SiteRecipe[],
  kept: SiteRecipe[],
): SiteRecipeHistory[] {
  const byHost = new Map(stored.map((entry) => [entry.host, entry]));
  for (const entry of incoming) {
    const sent = incomingRecipes.find((recipe) => recipe.host === entry.host);
    const winner = kept.find((recipe) => recipe.host === entry.host);
    if (!sent || !winner || sent.updatedAt !== winner.updatedAt || sent.css !== winner.css) continue;
    byHost.set(entry.host, { host: entry.host, revisions: entry.revisions.slice(-MAX_REVISIONS_PER_HOST) });
  }
  return [...byHost.values()].sort((a, b) => a.host.localeCompare(b.host));
}

export async function saveHistory(userId: string, history: SiteRecipeHistory[]): Promise<void> {
  await writeJson(dataPath(HISTORY_DIR, `${userId}.json`), history);
}
