// Selectorul CSS pe care îl pune agentul în rețetă pentru un element al site-ului (specs/04, „Selectorul”).
// Ordinea: #id scris de om → atribute stabile (aria-label, data-testid, role, name, href) → calea structurală.
// Nu folosim clase: pe site-urile mari sunt generate (.css-1x2y3z) și se schimbă la fiecare publicare.

/** Un id „scris de om”: începe cu o literă, fără șiruri lungi de cifre și fără bucăți care par aleatoare. */
const HUMAN_ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/;
const LONG_DIGITS = /\d{4,}/;
/** Ex. „:r1a:”, „ember123”, „a8f3k2”: amestec des de litere și cifre = generat. */
const RANDOMISH = /([a-z]\d){3,}|(\d[a-z]){3,}/i;

const STABLE_ATTRIBUTES = ["aria-label", "data-testid", "data-test-id", "name", "title"] as const;
/** Peste atâtea caractere, o valoare de atribut nu mai e un nume, e conținut (și s-ar schimba). */
const MAX_ATTRIBUTE_CHARS = 60;

function cssString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function looksHumanId(id: string): boolean {
  return HUMAN_ID.test(id) && !LONG_DIGITS.test(id) && !RANDOMISH.test(id);
}

function isUnique(doc: Document, selector: string, element: Element): boolean {
  try {
    const matches = doc.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
  } catch {
    return false;
  }
}

/** Primul segment al căii unui link intern, ex. „/shorts/abc” → a[href^="/shorts"]. */
function hrefSelector(element: Element): string | undefined {
  const href = element.getAttribute("href");
  if (!href || !href.startsWith("/") || href.startsWith("//")) return undefined;
  const firstSegment = href.split(/[/?#]/)[1];
  return firstSegment ? `a[href^=${cssString(`/${firstSegment}`)}]` : undefined;
}

/** Candidații din atribute stabile, de la cel mai specific la cel mai larg. */
function attributeCandidates(element: Element): string[] {
  const tag = element.tagName.toLowerCase();
  const candidates: string[] = [];
  for (const name of STABLE_ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (value && value.length <= MAX_ATTRIBUTE_CHARS) {
      candidates.push(`[${name}=${cssString(value)}]`, `${tag}[${name}=${cssString(value)}]`);
    }
  }
  const role = element.getAttribute("role");
  const label = element.getAttribute("aria-label");
  if (role && label && label.length <= MAX_ATTRIBUTE_CHARS) {
    candidates.push(`[role=${cssString(role)}][aria-label=${cssString(label)}]`);
  }
  const href = hrefSelector(element);
  if (href) candidates.push(href);
  return candidates;
}

/** `tag:nth-of-type(n)` doar când are frați cu aceeași etichetă. */
function stepFor(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const parent = element.parentElement;
  if (!parent) return tag;
  const sameTag = [...parent.children].filter((child) => child.tagName === element.tagName);
  return sameTag.length === 1 ? tag : `${tag}:nth-of-type(${sameTag.indexOf(element) + 1})`;
}

/** Calea de la cel mai apropiat strămoș cu id stabil (sau de la body), ex. „#menu > li:nth-of-type(3) > a”. */
function structuralPath(doc: Document, element: Element): string {
  const steps: string[] = [];
  let current: Element | null = element;
  while (current && current !== doc.body && current !== doc.documentElement) {
    if (
      current !== element &&
      current.id &&
      looksHumanId(current.id) &&
      isUnique(doc, `#${CSS.escape(current.id)}`, current)
    ) {
      return [`#${CSS.escape(current.id)}`, ...steps].join(" > ");
    }
    steps.unshift(stepFor(current));
    current = current.parentElement;
  }
  return ["body", ...steps].join(" > ");
}

export function buildSelector(element: Element, doc: Document = element.ownerDocument): string {
  if (element.id && looksHumanId(element.id)) {
    const byId = `#${CSS.escape(element.id)}`;
    if (isUnique(doc, byId, element)) return byId;
  }
  for (const candidate of attributeCandidates(element)) {
    if (isUnique(doc, candidate, element)) return candidate;
  }
  return structuralPath(doc, element);
}
