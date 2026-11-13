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
    const regions = findRegions();
    // Zona cea mai adâncă ce conține elementul (ultima în ordinea DOM dintre cele care îl conțin).
    const regionOf = (element: Element) => {
      for (let i = regions.length - 1; i >= 0; i--) if (regions[i]!.element.contains(element)) return regions[i];
      return undefined;
    };
    const scope = request.regionId ? regions.find((r) => r.id === request.regionId)?.element : undefined;

    // Id-urile se dau în ordinea paginii, pe toată pagina, ca același element să aibă același id după reîncărcare
    // (indiferent dacă primul snapshot a fost al unei zone sau al întregii pagini).
    const all = [...doc.querySelectorAll(ELEMENT_SELECTOR)].filter((element) => !isOurs(element, options.ourHostId));
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
      return {
        id: idOf(element),
        selector: buildSelector(element, doc),
        tag,
        role: roleOf(element),
        label: labelOf(element, doc),
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

    // În viewport întâi, apoi ce a ascuns rețeta (agentul verifică așa ce a schimbat), apoi restul, în ordinea paginii.
    const rank = (e: PageElement) => (e.inViewport ? 0 : e.hiddenBy === "recipe" ? 1 : 2);
    const ordered = elements
      .map((e, index) => ({ e, index }))
      .sort((a, b) => rank(a.e) - rank(b.e) || a.index - b.index);
    const kept = ordered.slice(0, SNAPSHOT_LIMITS.maxElements).map(({ e }) => e);

    const regionList: PageRegion[] = regions.map(({ element, id, role }) => ({
      id,
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

  return {
    idOf,
    elementOf: (id) => byId.get(id)?.deref(),
    snapshot,
  };
}
