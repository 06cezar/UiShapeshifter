// Schimbările de STRUCTURĂ ale unei pagini reale (etapele 2–4), salvate în rețeta site-ului lângă `css`.
// Agentul le trimite cu apply_ops; motorul de rețete (B6) le aplică și le reaplică la fiecare vizită, fără AI.
// Regulile: specs/02-ui-config.md (aplicare, undo), specs/03-componente-generate.md (elemente adăugate).
//
// Elementele se aleg cu **selectori** luați din snapshot (PageElement.selector), nu cu id-uri de registru:
// id-urile valorează doar cât pagina curentă, iar rețeta trebuie să se potrivească și la vizita următoare.

import type { ComponentProps, ComponentType } from "./components";

/** Unde se pune ceva față de un element-țintă. */
export type DomPosition = "before" | "after" | "prepend" | "append";

export interface DomPlace {
  /** Selectorul elementului față de care se așază. */
  selector: string;
  position: DomPosition;
}

/**
 * Atributele pe care agentul le poate schimba cu `setAttr`. Doar etichete și text: nu `href`, `src`, `style` sau `on*`.
 * (Aspectul se schimbă din CSS, comportamentul din `bind`.)
 */
export const SETTABLE_ATTRS = ["aria-label", "title", "alt", "placeholder"] as const;
export type SettableAttr = (typeof SETTABLE_ATTRS)[number];

/**
 * Elementele adăugate (wrap, insertHtml, inject) primesc `data-shape="<id>"`; agentul le stilizează în CSS cu
 * `[data-shape="<id>"]`. `id` are doar litere mici, cifre și `-`, cel mult 40 de caractere.
 */
export type ShapeId = string;

export type DomOp =
  /**
   * Ascunde elementul (atribut + `display:none`), fără să-l scoată din DOM: site-urile cu React se strică la noduri
   * detașate. Pentru agent arată la fel; „Anulez” / „Revino la original” scot ascunderea.
   */
  | { op: "remove"; selector: string }
  | { op: "move"; selector: string; to: DomPlace }
  /** Pune elementele într-un container nou, ca să poată fi așezate împreună (grid, flex). Containerul primește `id`. */
  | { op: "wrap"; selectors: string[]; id: ShapeId; tag?: WrapTag }
  | { op: "setText"; selector: string; text: string }
  | { op: "setAttr"; selector: string; name: SettableAttr; value: string }
  /** HTML scris de agent, curățat de validare (lista de mai jos). Rezultatul primește `id`. */
  | { op: "insertHtml"; id: ShapeId; html: string; at: DomPlace }
  /** Legătură: apăsarea elementului adăugat (`from`, un `id` de mai sus) apasă elementul real `to`. Doar click. */
  | { op: "bind"; from: ShapeId; to: string }
  /** O componentă din catalogul nostru (scurtături, plăci, carduri), pentru cazurile obișnuite. */
  | { op: "inject"; id: ShapeId; component: PageComponentSpec; at: DomPlace };

export type DomOpName = DomOp["op"];

export type WrapTag = "div" | "section" | "nav" | "aside" | "header" | "ul";

export const DOM_OP_LIMITS = {
  /** Operații într-o rețetă (adunate din toate reviziile); peste, `apply_ops` e refuzat cu INVALID_ARGS. */
  maxOpsPerRecipe: 60,
  /** Operații într-un singur apel apply_ops. */
  maxOpsPerCall: 20,
  maxHtmlBytes: 4000,
  maxTextChars: 200,
  maxShapeIdChars: 40,
} as const;

/**
 * Lista permisă pentru `insertHtml`. Orice altă etichetă sau atribut se scoate (cu un mesaj), iar o `href`
 * care nu începe cu `/`, `#` sau `https://` face respingerea întregii operații. Fără `<script>`, `<iframe>`,
 * `<img>`/`<video>` (încarcă resurse din afară), `<form>`/`<input>`, `style`, `on*`, `javascript:`.
 */
export const ALLOWED_HTML_TAGS = [
  "div", "span", "section", "nav", "aside", "header", "footer", "main",
  "h1", "h2", "h3", "h4", "p", "ul", "ol", "li", "a", "button", "strong", "em", "br", "hr",
] as const;

export const ALLOWED_HTML_ATTRS = ["class", "role", "title", "href", "aria-label", "aria-hidden", "lang"] as const;

// ---------- componentele pentru pagini (inject) ----------

/** Din catalogul din components.ts, fără ce ține de aplicația veche (contacte, liste legate de date, imagini). */
export type PageComponentType = Exclude<ComponentType, "contactTile" | "list" | "image">;

/** Ce face un element injectat când e apăsat. Doar acestea. */
export type PageAction =
  /** Apasă elementul real al site-ului (același efect ca `bind`, dar pentru componente din catalog). */
  | { kind: "click"; selector: string }
  /** Deschide o pagină a aceluiași site (cale relativă, începe cu `/`). */
  | { kind: "navigate"; path: string }
  /** Pornește agentul cu un scop (ex. „ajută-mă să plătesc factura”). */
  | { kind: "askAgent"; goal: string };

export interface PageComponentSpec {
  id: string;
  type: PageComponentType;
  props?: Pick<ComponentProps, "text" | "label" | "icon" | "tone" | "size" | "columns">;
  action?: PageAction;   // doar pentru button / shortcut
  children?: PageComponentSpec[];
}

/** Rezultatul unei operații din apply_ops care n-a putut fi aplicată (restul s-au aplicat). */
export type OpSkipReason =
  | "SELECTOR_NOT_FOUND"  // niciun element potrivit (site-ul s-a schimbat sau selectorul e greșit)
  | "SELECTOR_AMBIGUOUS"  // mai multe elemente și operația cere unul (move, wrap, bind)
  | "TARGET_NOT_FOUND"    // `to` / `at` nu se găsește
  | "ALREADY_APPLIED"     // aceeași operație e deja în rețetă
  | "INVALID";            // html/text/atribut respins de validare

export interface SkippedOp {
  /** Poziția în lista trimisă. */
  index: number;
  reason: OpSkipReason;
  message: string;        // pe înțeles, pentru model: ce să încerce
}

/** Ce validează `validateHtml`: ce a scos din `html` și de ce. */
export interface HtmlDropped {
  snippet: string;
  reason: "tag" | "attribute" | "href" | "size";
  message: string;
}
