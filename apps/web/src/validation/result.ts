// Ce întoarce validarea: ce a rămas de aplicat și ce s-a scos, cu motivul. Nu aruncă niciodată: agentul primește
// lista `dropped` în tool_result și își repară singur CSS-ul sau HTML-ul (specs/02, „Validarea CSS”).

import type { CssDropped, HtmlDropped } from "@uishapeshifter/contracts";

export interface CssValidation {
  /** Regulile care au trecut, fără comentarii. Gol dacă nu a rămas nimic. */
  css: string;
  dropped: CssDropped[];
}

export interface HtmlValidation {
  /** Forma normalizată de parser: pe ea s-a făcut verificarea, deci pe ea o inserezi, nu textul primit. */
  html: string;
  /** Ce s-a scos și de ce, în forma din contract (`HtmlDropped`, packages/contracts/src/dom-ops.ts). */
  dropped: HtmlDropped[];
  /**
   * `true` = operația `insertHtml` se respinge întreagă (specs/03): un link spre altă adresă decât `/`, `#` sau
   * `https://`, sau HTML peste `DOM_OP_LIMITS.maxHtmlBytes`. Atunci `html` e gol.
   */
  rejected: boolean;
}

/** Cât din bucata scoasă arătăm agentului (CssDropped.snippet: „cel mult 120 de caractere”). */
export const SNIPPET_CHARS = 120;

export function snippetOf(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_CHARS ? `${flat.slice(0, SNIPPET_CHARS - 1)}…` : flat;
}
