// Ce întoarce validarea: totul sau nimic. Dacă ceva e respins, nimic nu se aplică, iar agentul primește lista
// cu motivele (în tool_result) ca să-și repare singur CSS-ul sau HTML-ul. Nu „curățăm” pe tăcute: agentul trebuie
// să afle ce a greșit, altfel crede că pagina arată cum a cerut.

/** De ce a fost respins ceva. Codul e pentru teste și jurnal; mesajul, pentru model. */
export interface Rejection {
  rule: RejectionRule;
  message: string;
  /** Bucata care a declanșat refuzul, scurtată, ca agentul s-o găsească. */
  excerpt?: string;
}

export type RejectionRule =
  // CSS
  | "css-too-long"
  | "css-url"
  | "css-import"
  | "css-expression"
  | "css-script-url"
  | "css-legacy-binding"
  | "css-our-interface"
  | "css-unbalanced"
  | "css-html-tag"
  // HTML
  | "html-too-long"
  | "html-tag"
  | "html-event-handler"
  | "html-attribute"
  | "html-script-url"
  | "html-our-interface"
  | "html-style";

export type CssValidation = { ok: true; css: string } | { ok: false; rejected: Rejection[] };

/** `html` e forma normalizată de parser: pe ea s-a făcut verificarea, deci pe ea o inserezi, nu textul primit. */
export type HtmlValidation = { ok: true; html: string } | { ok: false; rejected: Rejection[] };

/** Cât din bucata problematică arătăm agentului. */
const EXCERPT_CHARS = 60;

export function excerptOf(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_CHARS ? `${flat.slice(0, EXCERPT_CHARS)}…` : flat;
}
