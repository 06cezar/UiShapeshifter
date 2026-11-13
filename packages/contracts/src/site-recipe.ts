// Rețeta unui site: tot ce a schimbat agentul pe un site, salvat ca să se reaplice la fiecare vizită, fără AI.
// Etapa 1 folosește doar `css`; `ops` (DomOp) vine în D8, ca adăugare (specs/01-arhitectura.md, specs/02-ui-config.md).
//
// Locul rețetei: `chrome.storage.local` (cheia = host) și, pentru cine are cont, pe server (specs/06-protocol.md).

export interface SiteRecipe {
  /** Numele de gazdă fără „www.”, ex. „youtube.com”. Rețeta se aplică pe toate paginile gazdei. */
  host: string;
  /** Crește cu 1 la fiecare schimbare a agentului; 0 = rețetă goală. „Anulez” coboară la revizia dinainte. */
  revision: number;
  /** Foaia de stil scrisă de agent, deja validată. Se aplică în pagină ca un <style> al extensiei. */
  css: string;
  updatedAt: string; // ISO
}

/** O revizie din istoricul unei rețete: cine a cerut, de ce, și cum arăta foaia după ea. */
export interface RecipeRevision {
  revision: number;
  css: string;
  reason: string;
  /** Rularea agentului care a produs-o (lipsește la schimbările făcute de preferințele de bază). */
  runId?: string;
  at: string; // ISO
}

/** Rețetă goală pentru un site nou. */
export function emptyRecipe(host: string, now: string): SiteRecipe {
  return { host, revision: 0, css: "", updatedAt: now };
}

export const RECIPE_LIMITS = {
  /** Mărimea maximă a foii de stil a unui site; peste, `apply_css` e refuzat cu INVALID_ARGS. */
  maxCssBytes: 20000,
  /** Revizii păstrate pentru „Anulez” (cele mai vechi se aruncă). */
  maxRevisions: 20,
} as const;

/** De ce a scos validarea o parte din CSS. Valorile sunt stabile, textul `message` e pentru model. */
export type CssDropReason =
  | "url-function"        // url(...): ar putea trimite date în afară
  | "import"              // @import
  | "expression"          // expression(...), behavior:, -moz-binding
  | "targets-our-ui"      // selector spre interfața noastră (rădăcina shadow, [data-agent-id])
  | "unsupported-at-rule" // @font-face, @charset etc. (lista permisă: @media, @supports, @keyframes)
  | "syntax";             // nu s-a putut citi

export interface CssDropped {
  /** Începutul regulii scoase (cel mult 120 de caractere), ca modelul să știe care. */
  snippet: string;
  reason: CssDropReason;
  message: string;
}
