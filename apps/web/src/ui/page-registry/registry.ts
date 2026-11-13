// Registrul paginii (specs/04): id-uri stabile pentru elementele unui site oarecare și rezumatul pentru agent.
// Id-urile stau în memorie (WeakMap element → id), nu ca atribute pe site: același element are același id cât e în pagină.

import {
  SNAPSHOT_LIMITS,
  type PageElement,
  type PageRegion,
  type PageSnapshot,
  type Rect,
} from "@uishapeshifter/contracts";
import { buildSelector } from "./selector";

/** Ce citește snapshot-ul de la motorul de rețete (B5): revizia, foaia și <style>-ul ei din pagină. */
export interface RecipeView {
  revision: number;
  css: string;
  /** Foaia aplicată acum, ca snapshot-ul să deosebească „ascuns de rețetă” de „ascuns de site”. */
  styleElement?: HTMLStyleElement | null;
}

export interface PageRegistry {
  idOf(element: Element): string;
  elementOf(id: string): Element | undefined;
  snapshot(options?: { regionId?: string }): PageSnapshot;
  /** Id-ul zonei (r.nav, r.main…) care conține elementul, același ca în snapshot; pentru semnale (E2). */
  regionIdOf(element: Element): string | undefined;
}

/** Zonele, după rol ARIA sau eticheta HTML5. */
const REGION_SELECTOR = [
  "header",
  "nav",
  "main",
  "aside",
  "footer",
  '[role="banner"]',
  '[role="navigation"]',
  '[role="main"]',
  '[role="complementary"]',
  '[role="contentinfo"]',
  '[role="region"][aria-label]',
  "section[aria-label]",
].join(",");
const TAG_REGION_ROLE: Record<string, string> = {
  header: "banner",
  nav: "navigation",
  main: "main",
  aside: "complementary",
  footer: "contentinfo",
  section: "region",
};
/** Nume scurte în id-urile zonelor: r.nav, r.main, r.aside-2. */
const ROLE_SHORT: Record<string, string> = {
  banner: "header",
  navigation: "nav",
  main: "main",
  complementary: "aside",
  contentinfo: "footer",
  region: "region",
};

/**
 * Ce vede agentul: titlurile, tot ce se poate apăsa sau completa și blocurile cu nume (reclame, rafturi, ferestre),
 * fiindcă exact pe acestea vrea omul să le scoată („ascunde reclama”, „fără Shorts”).
 */
const ELEMENT_SELECTOR = [
  "a[href]",
  "button",
  'input:not([type="hidden"])',
  "select",
  "textarea",
  "summary",
  "h1",
  "h2",
  "h3",
  "h4",
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[tabindex]:not([tabindex="-1"])',
  "[aria-label]",
  "section",
  "article",
  "dialog",
  '[role="dialog"]',
  "iframe[title]",
].join(",");
/** Titluri după care căutăm blocul care le conține (raftul „Shorts”, cardul „Facturi”). */
const TITLE_SELECTOR = 'h1, h2, h3, h4, [role="heading"], [id="title"]';
/** Un bloc e cel puțin de atâtea ori mai înalt decât titlul lui și are măcar atâtea linkuri/butoane. */
const BLOCK_HEIGHT_RATIO = 3;
const BLOCK_MIN_LINKS = 2;
/** Cât urcăm de la titlu după bloc. */
const BLOCK_MAX_DEPTH = 10;
/** Atributele unui element propriu al site-ului (ex. <ytd-rich-shelf-renderer is-shorts>) care spun ce fel de bloc e. */
const KIND_ATTRIBUTE_MAX_CHARS = 30;
const NOT_KIND_ATTRIBUTES = new Set(["id", "class", "style", "hidden", "tabindex", "role", "dir", "lang"]);

/** Câte elemente ascunse de site (din meniuri închise) intră cel mult în rezumat; au locuri rezervate. */
const MAX_SITE_HIDDEN = 15;

/** O coloană a conținutului principal e cel puțin atât de lată (rezultatele, coloana din dreapta). */
const COLUMN_MIN_WIDTH_PX = 200;
/** Măcar o coloană din rând e atât de înaltă: un rând de carduri scurte nu e o așezare pe coloane. */
const MAIN_COLUMN_MIN_HEIGHT_PX = 600;
/** Cât coborâm sub <main> după coloane (la Bing: main > #b_mcw > #b_results). */
const COLUMN_SEARCH_DEPTH = 3;
/** Cu display inline sau contents, cutia elementului nu spune unde e conținutul: îl iau din copii. */
const BOXLESS_DISPLAYS = new Set(["inline", "contents"]);

function isInteractive(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (INTERACTIVE_TAGS.has(tag)) return true;
  const role = element.getAttribute("role");
  return role === "button" || role === "link" || role === "menuitem" || role === "tab";
}

const INTERACTIVE_TAGS = new Set(["a", "button", "input", "select", "textarea", "summary"]);
const INPUT_ROLES: Record<string, string> = {
  checkbox: "checkbox",
  radio: "radio",
  range: "slider",
  submit: "button",
  button: "button",
  reset: "button",
  search: "searchbox",
};

function rectOf(element: Element): Rect {
  const r = element.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
}

/**
 * Dreptunghiul unei zone. La Bing, <main> și <aside> au display inline: cutia lor e o linie de 16px de la sfârșitul
 * paginii, iar coloanele reale sunt copiii. Atunci zona ocupă cât copiii ei care se văd.
 */
function regionRectOf(element: Element): Rect {
  if (!BOXLESS_DISPLAYS.has(getComputedStyle(element).display)) return rectOf(element);
  const boxes = [...element.children].map(regionRectOf).filter((r) => r.width > 0 && r.height > 0);
  if (boxes.length === 0) return rectOf(element);
  const left = Math.min(...boxes.map((r) => r.x));
  const top = Math.min(...boxes.map((r) => r.y));
  const right = Math.max(...boxes.map((r) => r.x + r.width));
  const bottom = Math.max(...boxes.map((r) => r.y + r.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function sideBySide(a: Rect, b: Rect): boolean {
  const apart = a.x + a.width <= b.x || b.x + b.width <= a.x;
  const sameRow = a.y < b.y + b.height && b.y < a.y + a.height;
  return apart && sameRow;
}

/**
 * Coloanele conținutului principal (rezultatele | coloana din dreapta): primul nivel sub <main> unde copii lați stau unul
 * lângă altul. Fără ele, „coloana din dreapta” sau „lista de rezultate” n-ar avea o zonă și un selector.
 */
function columnsOf(main: Element): Element[] {
  let level = [main];
  for (let depth = 0; depth < COLUMN_SEARCH_DEPTH && level.length > 0; depth++) {
    const next: Element[] = [];
    for (const parent of level) {
      const wide = [...parent.children]
        .map((element) => ({ element, rect: regionRectOf(element) }))
        .filter(({ rect }) => rect.width >= COLUMN_MIN_WIDTH_PX && rect.height > 0);
      const columns = wide.filter((c) => wide.some((other) => other !== c && sideBySide(c.rect, other.rect)));
      if (columns.length >= 2 && columns.some(({ rect }) => rect.height >= MAIN_COLUMN_MIN_HEIGHT_PX)) {
        return columns.map(({ element }) => element);
      }
      next.push(...wide.map(({ element }) => element));
    }
    level = next;
  }
  return [];
}

function byDocumentOrder(a: Element, b: Element): number {
  return a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function cleanText(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > SNAPSHOT_LIMITS.labelMaxChars ? `${clean.slice(0, SNAPSHOT_LIMITS.labelMaxChars - 1)}…` : clean;
}

/** Eticheta accesibilă: aria-label, aria-labelledby, alt/title, apoi textul vizibil. Niciodată valoarea unui câmp. */
function labelOf(element: Element, doc: Document): string {
  const aria = element.getAttribute("aria-label");
  if (aria) return cleanText(aria);
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id)?.textContent ?? "")
      .join(" ");
    if (text.trim()) return cleanText(text);
  }
  const tag = element.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    const id = element.getAttribute("id");
    const forLabel = id ? doc.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : null;
    return cleanText(forLabel ?? element.getAttribute("placeholder") ?? element.getAttribute("name") ?? "");
  }
  // innerText e gol pentru ce nu se vede (ex. într-un <details> închis); atunci textul din DOM, ca butonul ascuns de
  // site să aibă totuși nume (A, probat în Chromium pe „Plătește factura”).
  const own = (element as HTMLElement).innerText?.trim() || element.textContent || "";
  if (own.trim()) return cleanText(own);
  const img = element.querySelector("img[alt]");
  return cleanText(element.getAttribute("title") ?? img?.getAttribute("alt") ?? "");
}

function roleOf(element: Element): string {
  const explicit = element.getAttribute("role");
  if (explicit) return explicit;
  const tag = element.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "a") return "link";
  if (tag === "button" || tag === "summary") return "button";
  if (tag === "select") return "combobox";
  if (tag === "textarea") return "textbox";
  if (tag === "input") return INPUT_ROLES[(element.getAttribute("type") ?? "text").toLowerCase()] ?? "textbox";
  return "generic";
}

/**
 * Blocul care conține un titlu: primul strămoș mult mai înalt decât titlul și cu câteva linkuri. Fără el, agentul ar
 * vedea doar titlul „Shorts”, nu și raftul cu clipuri, și l-ar ascunde doar pe acela.
 */
function blockOfTitle(title: Element, stopAt: Set<Element>, doc: Document): Element | undefined {
  const titleHeight = title.getBoundingClientRect().height || 1;
  let firstBlock: Element | undefined;
  let current = title.parentElement;
  for (let depth = 0; current && depth < BLOCK_MAX_DEPTH; depth++, current = current.parentElement) {
    if (current === doc.body || current === doc.documentElement || stopAt.has(current)) break;
    const tall = current.getBoundingClientRect().height >= titleHeight * BLOCK_HEIGHT_RATIO;
    if (!tall || current.querySelectorAll("a[href], button").length < BLOCK_MIN_LINKS) continue;
    // Un element propriu al site-ului (<ytd-rich-shelf-renderer>) e chiar blocul; un <div> din el e doar o bucată.
    if (current.tagName.includes("-")) return current;
    firstBlock ??= current;
  }
  return firstBlock;
}

/**
 * Selectorul unui bloc: pentru elementele proprii ale site-ului (cu „-” în nume), eticheta plus atributul care spune
 * ce fel de bloc e, ex. `ytd-rich-shelf-renderer[is-shorts]`. Prinde intenționat TOATE blocurile de felul ăsta
 * (toate rafturile de Shorts), fiindcă asta vrea omul când spune „fără Shorts”.
 */
function blockSelector(block: Element, doc: Document): string {
  const tag = block.tagName.toLowerCase();
  if (tag.includes("-")) {
    const kinds = [...block.attributes]
      .filter((a) => !NOT_KIND_ATTRIBUTES.has(a.name) && a.value.length <= KIND_ATTRIBUTE_MAX_CHARS)
      .map((a) => (a.value === "" ? `${tag}[${a.name}]` : `${tag}[${a.name}="${a.value.replace(/"/g, '\\"')}"]`));
    const all = doc.querySelectorAll(tag).length;
    // atributul care deosebește blocul de frații lui de același tip (nu e pe toți)
    for (const selector of kinds) {
      try {
        const count = doc.querySelectorAll(selector).length;
        if (count >= 1 && count < all) return selector;
      } catch {
        // atribut cu nume ciudat: îl sărim
      }
    }
  }
  return buildSelector(block, doc);
}

function isShown(element: Element): boolean {
  // checkVisibility prinde și ce are mărime dar nu se desenează (conținutul unui <details> închis, content-visibility)
  if (typeof element.checkVisibility === "function" && !element.checkVisibility()) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

/** Elementul e în interfața noastră (gazda shadow a extensiei sau elementele cu data-agent-id)? */
function isOurs(element: Element, ourHostId: string): boolean {
  return element.closest(`#${CSS.escape(ourHostId)}, [data-agent-id]`) !== null;
}

export interface PageRegistryOptions {
  doc?: Document;
  /** Id-ul gazdei interfeței noastre (HOST_ID din extensie): tot ce e sub ea se sare. */
  ourHostId: string;
  recipe(): RecipeView;
  now?: () => Date;
}

export function createPageRegistry(options: PageRegistryOptions): PageRegistry {
  const doc = options.doc ?? document;
  const now = options.now ?? (() => new Date());
  const ids = new WeakMap<Element, string>();
  const byId = new Map<string, WeakRef<Element>>();
  let nextElement = 1;

  function remember(element: Element, id: string): string {
    ids.set(element, id);
    byId.set(id, new WeakRef(element));
    return id;
  }

  function idOf(element: Element): string {
    return ids.get(element) ?? remember(element, `e.${nextElement++}`);
  }

  /** Zonele în ordinea din DOM; id-ul după rol și numărul de ordine (r.nav, r.nav-2), deci același la reîncărcare. */
  function findRegions(): { element: Element; id: string; role: string }[] {
    const found: { element: Element; role: string }[] = [];
    for (const element of doc.querySelectorAll(REGION_SELECTOR)) {
      if (isOurs(element, options.ourHostId)) continue;
      // Un <header>/<footer> dintr-un articol sau dintr-o secțiune e antetul acelui bloc, nu al paginii (regula ARIA).
      const tag = element.tagName.toLowerCase();
      if ((tag === "header" || tag === "footer") && !element.hasAttribute("role")) {
        if (element.parentElement?.closest("article, aside, main, nav, section")) continue;
      }
      found.push({ element, role: element.getAttribute("role") ?? TAG_REGION_ROLE[tag] ?? "region" });
    }
    const known = new Set(found.map(({ element }) => element));
    for (const { element } of found.filter(({ role }) => role === "main")) {
      for (const column of columnsOf(element)) {
        if (known.has(column) || isOurs(column, options.ourHostId)) continue;
        known.add(column);
        found.push({ element: column, role: "region" });
      }
    }
    // În ordinea DOM: regionOf ia ultima zonă care conține elementul, adică pe cea mai adâncă.
    found.sort((a, b) => byDocumentOrder(a.element, b.element));

    const seen = new Map<string, number>();
    const regions: { element: Element; id: string; role: string }[] = [];
    for (const { element, role } of found) {
      const short = ROLE_SHORT[role] ?? "region";
      const count = (seen.get(short) ?? 0) + 1;
      seen.set(short, count);
      const id = count === 1 ? `r.${short}` : `r.${short}-${count}`;
      remember(element, id);
      regions.push({ element, id, role });
    }
    return regions;
  }

  function snapshot(request: { regionId?: string } = {}): PageSnapshot {
    const recipe = options.recipe();
    const blockTitles = new Map<Element, Element>();
    const regions = findRegions();
    // Zona cea mai adâncă ce conține elementul (ultima în ordinea DOM dintre cele care îl conțin).
    const regionOf = (element: Element) => {
      for (let i = regions.length - 1; i >= 0; i--) if (regions[i]!.element.contains(element)) return regions[i];
      return undefined;
    };
    const scope = request.regionId ? regions.find((r) => r.id === request.regionId)?.element : undefined;

    // Id-urile se dau în ordinea paginii, pe toată pagina, ca același element să aibă același id după reîncărcare
    // (indiferent dacă primul snapshot a fost al unei zone sau al întregii pagini).
    const direct = [...doc.querySelectorAll(ELEMENT_SELECTOR)].filter((element) => !isOurs(element, options.ourHostId));
    const regionElements = new Set(regions.map((r) => r.element));
    const blocks = new Set<Element>();
    for (const title of doc.querySelectorAll(TITLE_SELECTOR)) {
      if (isOurs(title, options.ourHostId)) continue;
      const block = blockOfTitle(title, regionElements, doc);
      if (block) {
        blocks.add(block);
        blockTitles.set(block, title);
      }
    }
    const directSet = new Set(direct);
    const all = [...direct, ...[...blocks].filter((b) => !directSet.has(b))].sort(byDocumentOrder);
    for (const element of all) idOf(element);
    const candidates = scope ? all.filter((element) => scope.contains(element)) : all;

    // Ce ar fi vizibil fără rețetă: oprim foaia o clipă, ca să știm ce a ascuns ea (hiddenBy: "recipe").
    const shownNow = new Set(candidates.filter(isShown));
    const hiddenByRecipe = new Set<Element>();
    const sheet = recipe.styleElement?.sheet;
    if (sheet && candidates.length > shownNow.size) {
      sheet.disabled = true;
      for (const element of candidates) if (!shownNow.has(element) && isShown(element)) hiddenByRecipe.add(element);
      sheet.disabled = false;
    }

    // Ce a ascuns SITE-UL (meniuri închise, <details>, „Mai multe acțiuni ⋯”): doar ce se poate apăsa și are nume.
    // Fără ele agentul n-ar ști că există „Plătește factura” din meniul ⋯ și n-ar putea face o scurtătură spre el.
    const hiddenBySite = new Set(
      candidates.filter(
        (element) =>
          !shownNow.has(element) &&
          !hiddenByRecipe.has(element) &&
          isInteractive(element) &&
          labelOf(element, doc) !== "",
      ),
    );

    const viewport = { width: doc.defaultView?.innerWidth ?? 0, height: doc.defaultView?.innerHeight ?? 0 };
    const listed = candidates.filter(
      (element) => shownNow.has(element) || hiddenByRecipe.has(element) || hiddenBySite.has(element),
    );
    const elements: PageElement[] = listed.map((element) => {
      const rect = rectOf(element);
      const visible = shownNow.has(element);
      const tag = element.tagName.toLowerCase();
      const fontPx = parseFloat(getComputedStyle(element).fontSize);
      const title = blocks.has(element) ? blockTitles.get(element) : undefined;
      return {
        id: idOf(element),
        selector: title ? blockSelector(element, doc) : buildSelector(element, doc),
        tag,
        role: title ? (element.getAttribute("role") ?? "group") : roleOf(element),
        label: title ? labelOf(title, doc) : labelOf(element, doc),
        regionId: regionOf(element)?.id,
        rect,
        visible,
        inViewport:
          visible &&
          rect.x < viewport.width &&
          rect.y < viewport.height &&
          rect.x + rect.width > 0 &&
          rect.y + rect.height > 0,
        interactive: INTERACTIVE_TAGS.has(tag) || element.hasAttribute("role") || element.hasAttribute("tabindex"),
        fontPx: Number.isFinite(fontPx) ? Math.round(fontPx) : undefined,
        ...(visible ? {} : { hiddenBy: hiddenByRecipe.has(element) ? ("recipe" as const) : ("site" as const) }),
      };
    });

    // Ce a ascuns rețeta întâi: sunt puține și fără ele agentul nu-și poate verifica munca (pe o pagină aglomerată,
    // elementele vizibile ar umple singure limita). Apoi ce e în viewport, apoi restul, în ordinea paginii.
    // Ce a ascuns site-ul are locuri rezervate (cel mult MAX_SITE_HIDDEN), ca să nu fie împins afară de restul paginii.
    const rank = (e: PageElement) => (e.hiddenBy === "recipe" ? 0 : e.inViewport ? 1 : 2);
    const ordered = elements
      .map((e, index) => ({ e, index }))
      .sort((a, b) => rank(a.e) - rank(b.e) || a.index - b.index)
      .map(({ e }) => e);
    const siteHidden = ordered.filter((e) => e.hiddenBy === "site").slice(0, MAX_SITE_HIDDEN);
    const others = ordered.filter((e) => e.hiddenBy !== "site");
    const kept = [...others.slice(0, SNAPSHOT_LIMITS.maxElements - siteHidden.length), ...siteHidden];

    const regionList: PageRegion[] = regions.map(({ element, id, role }) => ({
      id,
      // aceleași reguli ca la elemente: „fă bara de sus albastră” → apply_css pe selectorul zonei
      selector: buildSelector(element, doc),
      role,
      label: labelOf(element.querySelector("h1, h2, h3, [aria-label]") ?? element, doc),
      rect: regionRectOf(element),
      visible: isShown(element),
      elementCount: elements.filter((e) => e.regionId === id).length,
    }));

    const css = recipe.css;
    return {
      url: doc.location?.href ?? "",
      host: (doc.location?.hostname ?? "").toLowerCase().replace(/^www\./, ""),
      title: doc.title,
      viewport,
      regions: regionList,
      elements: kept,
      truncated: elements.length > kept.length,
      recipe: {
        revision: recipe.revision,
        css:
          css.length > SNAPSHOT_LIMITS.maxRecipeCssChars ? `${css.slice(0, SNAPSHOT_LIMITS.maxRecipeCssChars)}…` : css,
      },
      takenAt: now().toISOString(),
    };
  }

  function regionIdOf(element: Element): string | undefined {
    const regions = findRegions();
    for (let i = regions.length - 1; i >= 0; i--) if (regions[i]!.element.contains(element)) return regions[i]!.id;
    return undefined;
  }

  return {
    idOf,
    elementOf: (id) => byId.get(id)?.deref(),
    snapshot,
    regionIdOf,
  };
}
