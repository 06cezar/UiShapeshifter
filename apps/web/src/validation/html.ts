// Validarea bucăților de HTML scrise de agent (insertHtml, specs/01), înainte să ajungă în pagină.
// Listă permisă, nu listă interzisă: rămâne doar ce știm că nu rulează și nu încarcă nimic. Ca la CSS, scoatem
// elementul sau atributul greșit și spunem de ce (HtmlDropped); restul se inserează.
// Comportamentul elementelor adăugate vine din `bind` și din catalog, niciodată din HTML-ul modelului.

import { OUR_INTERFACE_MARKERS, validateCss } from "./css";
import { snippetOf, type HtmlDropped, type HtmlDropReason, type HtmlValidation } from "./result";

/** Etichete de structură și text. Fără nimic care încarcă (img, iframe, video), rulează (script) sau trimite (form). */
const ALLOWED_TAGS = new Set([
  "div", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "a", "button", "strong", "em", "b", "i",
  "u", "small", "mark", "abbr", "time", "br", "hr", "section", "nav", "header", "footer", "main", "aside", "article",
  "figure", "figcaption", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "label", "details", "summary",
]); // prettier-ignore

/** Atribute permise pe orice etichetă permisă; în plus `aria-*` și `data-*` (fără `data-agent-id`, al nostru). */
const GLOBAL_ATTRIBUTES = new Set(["class", "id", "title", "role", "lang", "dir", "tabindex", "hidden", "style"]);
const TAG_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  a: new Set(["href", "target", "rel"]),
  button: new Set(["type", "disabled"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  td: new Set(["colspan", "rowspan"]),
  time: new Set(["datetime"]),
  details: new Set(["open"]),
};

/** Unde poate duce un link. Fără schemă (relativ sau `#ancoră`) rămâne în site. */
const ALLOWED_LINK_SCHEMES = new Set(["http", "https", "mailto", "tel"]);
const SCRIPT_SCHEMES = new Set(["javascript", "vbscript", "data"]);

export function validateHtml(html: string): HtmlValidation {
  // În <template> parserul nu rulează nimic și nu mută <script>/<style> în <head>, cum ar face DOMParser.
  const template = document.createElement("template");
  template.innerHTML = html;

  const dropped: HtmlDropped[] = [];
  // Lista e făcută înainte de schimbări: un element scos ia cu el tot ce e înăuntru, iar copiii lui nu mai contează.
  for (const element of [...template.content.querySelectorAll("*")]) {
    if (!template.content.contains(element)) continue;
    checkElement(element, dropped);
  }
  // Verificăm arborele, deci inserăm arborele: textul primit, reparsat altundeva, ar putea ieși altfel.
  return { html: template.innerHTML, dropped };
}

function checkElement(element: Element, dropped: HtmlDropped[]): void {
  const tag = element.localName;
  if (!ALLOWED_TAGS.has(tag)) {
    const ours = OUR_INTERFACE_MARKERS.some((marker) => tag.includes(marker));
    drop(
      dropped,
      element.outerHTML,
      ours ? "targets-our-ui" : "tag",
      ours
        ? `<${tag}> ține de interfața extensiei. Adaugă doar elemente pentru site.`
        : `<${tag}> nu e permis. Folosește etichete de text și structură (div, p, a, button, ul…).`,
    );
    element.remove();
    return;
  }
  for (const { name, value } of [...element.attributes]) {
    const reason = attributeProblem(tag, name, value);
    if (reason) {
      drop(dropped, `<${tag} ${name}="${value}">`, reason.reason, reason.message);
      element.removeAttribute(name);
    }
  }
}

function attributeProblem(
  tag: string,
  name: string,
  value: string,
): { reason: HtmlDropReason; message: string } | undefined {
  if (name.startsWith("on")) {
    return { reason: "event-handler", message: `${name} rulează cod. Comportamentul vine din bind, nu din HTML.` };
  }
  if (name === "data-agent-id" || OUR_INTERFACE_MARKERS.some((marker) => value.toLowerCase().includes(marker))) {
    return { reason: "targets-our-ui", message: `${name} imită interfața extensiei. Folosește alt nume.` };
  }
  const allowed =
    GLOBAL_ATTRIBUTES.has(name) ||
    TAG_ATTRIBUTES[tag]?.has(name) === true ||
    name.startsWith("aria-") ||
    name.startsWith("data-");
  if (!allowed) return { reason: "attribute", message: `Atributul ${name} nu e permis pe <${tag}>.` };
  if (name === "href") return linkProblem(value);
  if (name === "style") return styleProblem(value);
  return undefined;
}

function linkProblem(href: string): { reason: HtmlDropReason; message: string } | undefined {
  // Browserul ignoră spațiile și caracterele de control din schemă: „ java\tscript:” e tot javascript:.
  const compact = href.replace(/[\u0000- ]+/g, "").toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(compact)?.[1];
  if (scheme === undefined || ALLOWED_LINK_SCHEMES.has(scheme)) return undefined;
  if (SCRIPT_SCHEMES.has(scheme)) {
    return { reason: "script-url", message: `Linkul ${scheme}: rulează cod sau ascunde conținut. Folosește http(s).` };
  }
  return { reason: "attribute", message: `Linkul ${scheme}: nu e permis. Folosește http(s), mailto sau tel.` };
}

/** `style="…"` e tot CSS: trece prin aceeași validare, ca un `url()` să nu intre pe ușa din spate. */
function styleProblem(style: string): { reason: HtmlDropReason; message: string } | undefined {
  const { dropped } = validateCss(`x { ${style} }`);
  if (dropped.length === 0) return undefined;
  return { reason: "style", message: `style="…": ${dropped.map((d) => d.message).join(" ")}` };
}

function drop(dropped: HtmlDropped[], text: string, reason: HtmlDropReason, message: string): void {
  dropped.push({ snippet: snippetOf(text), reason, message });
}
