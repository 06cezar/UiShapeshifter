// Cât de larg se aplică o schimbare: doar pagina de acum, tot site-ul sau toate site-urile. Hotărăște omul, prin ce
// scrie; agentul nu are voie să lărgească. Fără nicio mențiune, schimbarea rămâne pe pagina pe care a fost cerută.
// Funcții pure, ca restul validării: le folosește cine salvează rețeta (motorul de rețete și serverul).

/** Unde se aplică o schimbare. Ordinea contează: fiecare o cuprinde pe cea dinainte. */
export type RequestScope = "page" | "site" | "all";

const SCOPE_ORDER: readonly RequestScope[] = ["page", "site", "all"];

/** Fără nicio mențiune, schimbarea rămâne pe pagina de acum (cererea lui Adelin). */
export const DEFAULT_SCOPE: RequestScope = "page";

/**
 * Doar aici: bate orice altă mențiune din aceeași cerere („doar pe pagina asta, nu pe tot site-ul”).
 * „Nu doar aici” spune invers, deci nu se socotește. Textul e deja fără diacritice și cu litere mici (`normalize`).
 */
const ONLY_HERE_PATTERNS = [
  /(?<!\bnu )\bdoar (pe |in )?(pagina|aici)\b/,
  /(?<!\bnu )\bnumai (pe |in )?(pagina|aici)\b/,
];

/** Tot site-ul de acum: toate paginile lui, nu doar cea deschisă. */
const SITE_PATTERNS = [
  /\b(pe |in )?tot(ul)? site(-?ul)?\b/,
  /\b(pe |in )?intreg(ul)? site(-?ul)?\b/,
  /\btoate paginile (site-?ului|acestui site|de pe|lui)\b/,
  /\b(pe|in) (acest site|site-?ul (asta|acesta|acela|lor))\b/,
  /\bpe site\b(?!-)/,
];

/** Toate site-urile: doar când omul o spune limpede. */
const ALL_PATTERNS = [
  /\b(pe |in )?(toate|orice|fiecare|celelalte|alte) (site-?uri(le)?|site)\b/,
  /\b(in|pe) site-?uri\b/, // „nu vreau AI în site-uri”; „pe site-urile de știri” nu (descrie, nu cere un loc)
  /\bpeste tot\b/,
  /\boriunde\b/,
  /\b(pe |in )?toate paginile\b/,
  /\bpe tot internetul\b/,
];

/** Litere mici, fără diacritice (ș, ş, ț, ţ, ă, â, î), spațiile strânse: omul scrie cum vrea. */
function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/** Cât de larg a cerut omul, din textul cererii. Fără nicio mențiune: doar pagina de acum. */
export function requestedScope(request: string): RequestScope {
  const text = normalize(request);
  if (ONLY_HERE_PATTERNS.some((pattern) => pattern.test(text))) return "page";
  // Întâi site-ul: „toate paginile site-ului” conține și „toate paginile”.
  if (SITE_PATTERNS.some((pattern) => pattern.test(text))) return "site";
  if (ALL_PATTERNS.some((pattern) => pattern.test(text))) return "all";
  return DEFAULT_SCOPE;
}

/**
 * Unde se salvează schimbarea: ce a ales agentul, dar niciodată mai larg decât a cerut omul. Fără alegerea agentului,
 * cât a cerut omul. Așa „ascunde bara asta” nu ajunge pe toate site-urile chiar dacă modelul greșește.
 */
export function effectiveScope(request: string, agentScope?: RequestScope): RequestScope {
  const allowed = requestedScope(request);
  if (!agentScope) return allowed;
  return SCOPE_ORDER.indexOf(agentScope) <= SCOPE_ORDER.indexOf(allowed) ? agentScope : allowed;
}
