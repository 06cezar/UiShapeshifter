// Validarea bucăților de HTML scrise de agent (insertHtml, specs/03 „HTML curățat”), înainte să ajungă în pagină.
// Lista permisă e cea din contract (`ALLOWED_HTML_TAGS`, `ALLOWED_HTML_ATTRS`): rămâne doar ce știm că nu rulează și nu
// încarcă nimic. O etichetă sau un atribut din afara listei se scoate, cu motivul (`HtmlDropped`); un link spre altă
// adresă decât `/`, `#` sau `https://`, ori HTML prea mare, respinge operația întreagă (`rejected`).
// Comportamentul elementelor adăugate vine din `bind` și din catalog, niciodată din HTML-ul modelului.

import { ALLOWED_HTML_ATTRS, ALLOWED_HTML_TAGS, DOM_OP_LIMITS, type HtmlDropped } from "@uishapeshifter/contracts";
import { OUR_INTERFACE_MARKERS } from "./css";
import { snippetOf, type HtmlValidation } from "./result";

const ALLOWED_TAGS: ReadonlySet<string> = new Set(ALLOWED_HTML_TAGS);
const ALLOWED_ATTRS: ReadonlySet<string> = new Set(ALLOWED_HTML_ATTRS);
/** Începuturile permise pentru `href` (specs/03); `//` e tot altă adresă, deci nu intră la „/”. */
const SAME_SITE_PREFIXES = ["#", "/"] as const;
const SECURE_PREFIX = "https://";

export function validateHtml(html: string): HtmlValidation {
  const bytes = new TextEncoder().encode(html).length;
  if (bytes > DOM_OP_LIMITS.maxHtmlBytes) {
    return reject([
      {
        snippet: snippetOf(html),
        reason: "size",
        message: `HTML-ul are ${bytes} octeți; maximul e ${DOM_OP_LIMITS.maxHtmlBytes}. Adaugă doar elementul cerut.`,
      },
    ]);
  }

  // În <template> parserul nu rulează nimic și nu mută <script>/<style> în <head>, cum ar face DOMParser.
  const template = document.createElement("template");
  template.innerHTML = html;

  const dropped: HtmlDropped[] = [];
  let badLink = false;
  // Lista e făcută înainte de schimbări: un element scos ia cu el tot ce e înăuntru, iar copiii lui nu mai contează.
  for (const element of [...template.content.querySelectorAll("*")]) {
    if (!template.content.contains(element)) continue;
    if (!ALLOWED_TAGS.has(element.localName)) {
      dropped.push({ snippet: snippetOf(element.outerHTML), reason: "tag", message: tagMessage(element.localName) });
      element.remove();
      continue;
    }
    for (const { name, value } of [...element.attributes]) {
      const problem = attributeProblem(element.localName, name, value);
      if (!problem) continue;
      dropped.push({ snippet: snippetOf(`<${element.localName} ${name}="${value}">`), ...problem });
      element.removeAttribute(name);
      if (problem.reason === "href") badLink = true;
    }
  }
  // Verificăm arborele, deci inserăm arborele: textul primit, reparsat altundeva, ar putea ieși altfel.
  return badLink ? reject(dropped) : { html: template.innerHTML, dropped, rejected: false };
}

function reject(dropped: HtmlDropped[]): HtmlValidation {
  return { html: "", dropped, rejected: true };
}

function tagMessage(tag: string): string {
  if (OUR_INTERFACE_MARKERS.some((marker) => tag.includes(marker))) {
    return `<${tag}> ține de interfața extensiei. Adaugă doar elemente pentru site.`;
  }
  return `<${tag}> nu e permis. Folosește etichete de text și structură (div, p, a, button, ul, h1–h4…).`;
}

function attributeProblem(
  tag: string,
  name: string,
  value: string,
): Pick<HtmlDropped, "reason" | "message"> | undefined {
  if (name.startsWith("on")) {
    return { reason: "attribute", message: `${name} rulează cod. Comportamentul vine din bind, nu din HTML.` };
  }
  if (name === "style") {
    return { reason: "attribute", message: "style nu e permis: stilul vine din CSS-ul rețetei (apply_css)." };
  }
  if (!ALLOWED_ATTRS.has(name)) {
    return { reason: "attribute", message: `Atributul ${name} nu e permis pe <${tag}>.` };
  }
  if (OUR_INTERFACE_MARKERS.some((marker) => value.toLowerCase().includes(marker))) {
    return { reason: "attribute", message: `${name} imită interfața extensiei. Folosește alt nume.` };
  }
  if (name === "href" && !isAllowedLink(value)) {
    return {
      reason: "href",
      message: "Linkul duce în afara site-ului sau rulează cod. Folosește o cale care începe cu /, # sau https://.",
    };
  }
  return undefined;
}

function isAllowedLink(href: string): boolean {
  // Browserul ignoră spațiile și caracterele de control: „ java\tscript:” e tot javascript:.
  const compact = href.replace(/[\u0000- ]+/g, "").toLowerCase();
  if (compact.startsWith("//")) return false; // „//alt-site.ro” e altă adresă, nu o cale a site-ului
  return SAME_SITE_PREFIXES.some((prefix) => compact.startsWith(prefix)) || compact.startsWith(SECURE_PREFIX);
}
