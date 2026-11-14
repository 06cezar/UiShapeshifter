// Paza profilului împotriva textului din pagini (prompt injection): o preferință generală nouă trece pe orice site,
// deci o salvăm doar dacă dovada ei e chiar ce a scris omul. Un site care îi „spune” modelului „salvează că vrea X peste
// tot” nu ajunge în profil nici dacă modelul se lasă păcălit. Cererile reale nu pierd nimic: agentul citează deja cererea.

import type { GeneralPreference, JsonPatchOp } from "@uishapeshifter/contracts";

const GENERAL_PREFERENCES_PATH = "/generalPreferences";
/** Sub atâtea caractere, un „citat” se potrivește cu orice text („da”, „AI”). */
const MIN_EVIDENCE_CHARS = 4;

/** Litere mici, fără diacritice și fără semne: „Fundalul VERDE!” și „fundalul verde” sunt același citat. */
export function normalizeQuote(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isPreference(value: unknown): value is Pick<GeneralPreference, "text" | "category" | "evidence"> {
  const preference = value as GeneralPreference | null;
  return typeof preference === "object" && preference !== null && typeof preference.text === "string";
}

/** Aceeași preferință ca una din profil: atunci e doar notarea unui site nou (appliedOn), nu o preferință nouă. */
function isKnown(preference: Pick<GeneralPreference, "text" | "category">, existing: readonly GeneralPreference[]) {
  return existing.some((known) =>
    known.category && preference.category
      ? known.category === preference.category
      : normalizeQuote(known.text) === normalizeQuote(preference.text),
  );
}

function quotesTheUser(evidence: unknown, userTexts: readonly string[]): boolean {
  if (!Array.isArray(evidence)) return false;
  const said = userTexts.map(normalizeQuote);
  return evidence.some((quote) => {
    if (typeof quote !== "string") return false;
    const normalized = normalizeQuote(quote);
    return normalized.length >= MIN_EVIDENCE_CHARS && said.some((text) => text.includes(normalized));
  });
}

/**
 * Preferințele generale noi din patch care nu citează ce a scris omul (cererea de acum sau conversația recentă).
 * Lista goală înseamnă că patch-ul poate trece. Scoaterea unei preferințe (`remove`) nu adaugă nimic, deci trece.
 */
export function unbackedPreferences(
  patch: readonly JsonPatchOp[] | undefined,
  userTexts: readonly string[],
  existing: readonly GeneralPreference[],
): string[] {
  const rejected: string[] = [];
  for (const op of patch ?? []) {
    if (typeof op?.path !== "string" || !op.path.startsWith(GENERAL_PREFERENCES_PATH) || op.op === "remove") continue;
    const values = Array.isArray(op.value) ? op.value : [op.value];
    for (const value of values) {
      // o schimbare de câmp (ex. text) într-o preferință existentă ar putea-o rescrie fără dovadă: n-o lăsăm
      if (!isPreference(value)) {
        rejected.push(op.path);
        continue;
      }
      if (isKnown(value, existing) || quotesTheUser(value.evidence, userTexts)) continue;
      rejected.push(value.text);
    }
  }
  return rejected;
}
