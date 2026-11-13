// Ce întoarce validarea: ce a rămas de aplicat și ce s-a scos, cu motivul. Nu aruncă niciodată: agentul primește
// lista `dropped` în tool_result și își repară singur CSS-ul sau HTML-ul (specs/02, „Validarea CSS”).

import type { CssDropped } from "@uishapeshifter/contracts";

export interface CssValidation {
  /** Regulile care au trecut, fără comentarii. Gol dacă nu a rămas nimic. */
  css: string;
  dropped: CssDropped[];
}

/**
 * De ce a scos validarea o parte din HTML. Local până vin tipurile pentru insertHtml în D8 (contracte);
 * atunci se mută în `packages/contracts`, cu aceleași valori.
 */
export type HtmlDropReason =
  | "tag" // etichetă din afara listei permise (script, iframe, img, form…); se scoate cu tot ce e în ea
  | "event-handler" // atribut on*
  | "attribute" // atribut din afara listei permise, sau link cu schemă nepermisă
  | "script-url" // javascript:, vbscript:, data: într-un link
  | "targets-our-ui" // imită interfața noastră (data-agent-id, rădăcina shadow)
  | "style"; // style="…" cu CSS care n-ar trece de validateCss

export interface HtmlDropped {
  /** Începutul elementului scos (cel mult SNIPPET_CHARS caractere), ca modelul să știe care. */
  snippet: string;
  reason: HtmlDropReason;
  message: string;
}

export interface HtmlValidation {
  /** Forma normalizată de parser: pe ea s-a făcut verificarea, deci pe ea o inserezi, nu textul primit. */
  html: string;
  dropped: HtmlDropped[];
}

/** Cât din bucata scoasă arătăm agentului (CssDropped.snippet: „cel mult 120 de caractere”). */
export const SNIPPET_CHARS = 120;

export function snippetOf(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_CHARS ? `${flat.slice(0, SNIPPET_CHARS - 1)}…` : flat;
}
