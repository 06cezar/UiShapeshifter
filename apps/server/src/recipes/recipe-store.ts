// Rețetele pe server: copia pentru cine are cont (sincronizarea pe alt dispozitiv, E6). Sursa pentru reaplicare rămâne
// stocarea locală a extensiei (specs/06). Un fișier pe site: data/recipes/<userId>/<host>.json.

import { readdir, rm } from "node:fs/promises";
import { DOM_OP_LIMITS, RECIPE_LIMITS, type SiteRecipe } from "@uishapeshifter/contracts";
import { dataPath, isSafeHost, isSafeId, readJson, writeJson } from "../storage/json-files";

const RECIPES_DIR = "recipes";

function recipePath(userId: string, host: string): string {
  return dataPath(RECIPES_DIR, userId, `${host}.json`);
}

/**
 * Forma unei rețete venite din afară (extensia, un fișier vechi). CSS-ul și operațiile le-a validat deja extensia
 * înainte să le aplice; aici verificăm forma și limitele, ca serverul să nu păstreze ceva ce extensia ar refuza.
 * Întoarce motivul, pentru mesajul 400.
 */
export function checkRecipe(value: unknown): string | null {
  const recipe = value as SiteRecipe | null;
  if (typeof recipe !== "object" || recipe === null || Array.isArray(recipe)) return "Rețeta trebuie să fie un obiect.";
  if (typeof recipe.host !== "string" || !isSafeHost(recipe.host)) return "host lipsește sau nu e valid.";
  if (!Number.isInteger(recipe.revision) || recipe.revision < 0) return "revision trebuie să fie un întreg ≥ 0.";
  if (typeof recipe.css !== "string") return "css trebuie să fie text.";
  if (Buffer.byteLength(recipe.css, "utf8") > RECIPE_LIMITS.maxCssBytes) {
    return `css are peste ${RECIPE_LIMITS.maxCssBytes} de octeți.`;
  }
  if (recipe.ops !== undefined) {
    if (!Array.isArray(recipe.ops)) return "ops trebuie să fie o listă.";
    if (recipe.ops.length > DOM_OP_LIMITS.maxOpsPerRecipe) {
      return `ops are peste ${DOM_OP_LIMITS.maxOpsPerRecipe} de operații.`;
    }
    const opNames = ["remove", "move", "wrap", "setText", "setAttr", "insertHtml", "bind", "inject"];
    if (
      !recipe.ops.every((op) => typeof op === "object" && op !== null && opNames.includes((op as { op: string }).op))
    ) {
      return "o operație din ops nu are un `op` cunoscut.";
    }
  }
  if (typeof recipe.updatedAt !== "string") return "updatedAt trebuie să fie o dată ISO.";
  return null;
}

export async function loadRecipe(userId: string, host: string): Promise<SiteRecipe | null> {
  if (!isSafeId(userId) || !isSafeHost(host)) return null;
  const value = await readJson(recipePath(userId, host));
  return checkRecipe(value) === null ? (value as SiteRecipe) : null;
}

/** Toate rețetele unui om, ordonate după site. */
export async function listRecipes(userId: string): Promise<SiteRecipe[]> {
  if (!isSafeId(userId)) return [];
  let files: string[];
  try {
    files = await readdir(dataPath(RECIPES_DIR, userId));
  } catch {
    return []; // încă nicio rețetă
  }
  const hosts = files.filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -".json".length));
  const recipes = await Promise.all(hosts.map((host) => loadRecipe(userId, host)));
  return recipes.filter((recipe): recipe is SiteRecipe => recipe !== null).sort((a, b) => a.host.localeCompare(b.host));
}

export async function saveRecipe(userId: string, recipe: SiteRecipe): Promise<void> {
  await writeJson(recipePath(userId, recipe.host), recipe);
}

/** „Revino la original”: rețeta dispare și de pe server. */
export async function deleteRecipe(userId: string, host: string): Promise<void> {
  await rm(recipePath(userId, host), { force: true });
}
