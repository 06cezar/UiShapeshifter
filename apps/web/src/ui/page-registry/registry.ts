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
  const own = (element as HTMLElement).innerText ?? element.textContent ?? "";
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
    const seen = new Map<string, number>();
    const regions: { element: Element; id: string; role: string }[] = [];
    for (const element of doc.querySelectorAll(REGION_SELECTOR)) {
      if (isOurs(element, options.ourHostId)) continue;
      // Un <header>/<footer> dintr-un articol sau dintr-o secțiune e antetul acelui bloc, nu al paginii (regula ARIA).
      const tag = element.tagName.toLowerCase();
      if ((tag === "header" || tag === "footer") && !element.hasAttribute("role")) {
        if (element.parentElement?.closest("article, aside, main, nav, section")) continue;
      }
      const role = element.getAttribute("role") ?? TAG_REGION_ROLE[element.tagName.toLowerCase()] ?? "region";
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
    const all = [...direct, ...[...blocks].filter((b) => !directSet.has(b))].sort((a, b) =>
      a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
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

    const viewport = { width: doc.defaultView?.innerWidth ?? 0, height: doc.defaultView?.innerHeight ?? 0 };
    const listed = candidates.filter((element) => shownNow.has(element) || hiddenByRecipe.has(element));
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
        ...(visible ? {} : { hiddenBy: "recipe" as const }),
      };
    });

    // Ce a ascuns rețeta întâi: sunt puține și fără ele agentul nu-și poate verifica munca (pe o pagină aglomerată,
    // elementele vizibile ar umple singure limita). Apoi ce e în viewport, apoi restul, în ordinea paginii.
    const rank = (e: PageElement) => (e.hiddenBy === "recipe" ? 0 : e.inViewport ? 1 : 2);
    const ordered = elements
      .map((e, index) => ({ e, index }))
      .sort((a, b) => rank(a.e) - rank(b.e) || a.index - b.index);
    const kept = ordered.slice(0, SNAPSHOT_LIMITS.maxElements).map(({ e }) => e);

    const regionList: PageRegion[] = regions.map(({ element, id, role }) => ({
      id,
      // aceleași reguli ca la elemente: „fă bara de sus albastră” → apply_css pe selectorul zonei
      selector: buildSelector(element, doc),
      role,
      label: labelOf(element.querySelector("h1, h2, h3, [aria-label]") ?? element, doc),
      rect: rectOf(element),
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
