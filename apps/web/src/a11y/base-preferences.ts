// Preferințele de bază, fără AI (C4, specs/07 nivelul 2): din profil, pe orice site, de la prima încărcare.
// Ridică textul sub fontul minim, culorile sub contrastul cerut, rândurile prea înghesuite (WCAG 1.4.12), marginile
// butoanelor care abia se văd (WCAG 1.4.11) și țintele sub mărimea minimă. Nu schimbă structura
// și nu ascunde nimic; doar aduce pagina la limitele omului.
//
// De ce stil inline cu `!important`, element cu element: CSS-ul nu poate spune „cel puțin 20px” fără să afle mărimea
// fiecărui element (un `max(20px, 1em)` global ar strica titlurile mari), deci măsurăm. Iar o regulă `!important`
// a rețetei agentului cu un selector mai specific ar bate orice foaie de-a noastră; un stil inline `!important` nu
// poate fi bătut de nicio foaie. Așa se aplică „ultimele, peste tot ce a scris agentul”.

import { HARD_LIMITS, type AuditThresholds, type UserNeeds } from "@uishapeshifter/contracts";
import { adjustToContrast, composite, contrastRatio, parseColor, requiredTextContrast, toHex } from "./contrast";
import {
  effectiveBackground,
  factsOf,
  hasImageBackground,
  isInHeightLimitedBox,
  isSingleLineText,
  ownTextRects,
} from "./dom";
import { hasOwnText, isInteractive, isLinkInSentence, isVisible, SKIPPED_TAGS } from "./page-audit";
import { thresholdsFor } from "./thresholds";

/** Foaia noastră pentru mișcare redusă; „uishapeshifter” în id, ca rețeta agentului să n-o poată atinge (C5). */
export const BASE_STYLE_ID = "uishapeshifter-base";
/** Câte elemente verificăm cel mult la o trecere; o pagină mai mare primește restul pe măsură ce se schimbă. */
export const MAX_BASE_ELEMENTS = 20_000;
/** Atributele care arată conținut ascuns până atunci. Nu `style`/`class`: le scriem chiar noi și s-ar schimba în buclă. */
const REVEALING_ATTRIBUTES = ["open", "hidden"];
/** `line-height: normal` în browsere e ~1.2 din mărimea fontului (la fel ca în dom.ts). */
const NORMAL_LINE_HEIGHT = 1.2;
/** Cât urcăm de la text după containerul care îl taie (eticheta din bara laterală stă în 1–3 cutii). */
const CLIPPING_LABEL_DEPTH = 3;
/** Valorile `overflow-x` cu care o cutie își taie conținutul. */
const CLIPPING_OVERFLOW = new Set(["hidden", "clip"]);
/**
 * Cutia care taie e îngustă ca o bară laterală de iconițe (Teams: ~68px). Un meniu sau un antet lat, chiar cu
 * `nowrap` + `overflow: hidden`, își primește fontul minim ca orice text (review D pe #100).
 */
const CLIPPED_LABEL_MAX_BOX_PX = 120;
/** Doar etichete scurte („Activitate”, „Calendar”), nu fraze. */
const CLIPPED_LABEL_MAX_CHARS = 24;
/**
 * Sub atâta contrast față de fundalul din jur, marginea e pusă să nu se vadă (loc rezervat pentru hover): nu o facem
 * vizibilă. Altfel butoanele de reacție din Teams primeau cercuri gri (găsit de Adelin).
 */
const MIN_INTENDED_BORDER_CONTRAST = 1.1;
/** O suprapunere mai mică de atât, pe oricare axă, e doar o atingere de margini. */
const OVERLAP_MIN_PX = 4;
/** Sub atât, mărimea unei poze nu s-a schimbat (rotunjiri). */
const RESIZE_EPS_PX = 1;
/** Cât urcăm după o cutie scoasă din flux (absolute, fixed, float), ca ora din bula WhatsApp. */
const OUT_OF_FLOW_DEPTH = 3;
/** Ce numim „poză” în interiorul unei ținte: dacă se mărește odată cu ținta, mărirea țintei se anulează. */
const MEDIA_SELECTOR = "img, svg, video, picture, canvas";
/**
 * La conținutul încărcat mai târziu (un link „Traducerea acestei pagini” lângă adresa unui rezultat Google), verificăm
 * și vecinii: textele din cutia de atâtea niveluri deasupra, măsurate înainte de scriere.
 */
const NEIGHBORHOOD_DEPTH = 2;
/** Cel mult atâția vecini măsurați la o trecere parțială, ca o listă lungă să nu încetinească pagina. */
const MAX_NEIGHBORS = 300;
/** Latura unui pătrat din grila cu textele paginii: căutăm suprapuneri doar printre textele din preajmă. */
const GRID_CELL_PX = 128;
/** Un text care acoperă mai multe pătrate decât atât (un container uriaș) se verifică separat, fără grilă. */
const MAX_GRID_CELLS_PER_TEXT = 64;
/**
 * Proprietățile scrise de noi care măresc textul, respectiv ținta; doar pe ele le anulăm la verificare. Cu fontul pleacă
 * și rândul scris pentru el: altfel eticheta rămânea cu fontul site-ului, dar cu un rând mai înalt decât al vecinilor.
 */
const FONT_GROWTH = ["font-size", "line-height"];
const TARGET_GROWTH = ["min-height", "min-width", "display"];

const REDUCED_MOTION_CSS =
  "*, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;" +
  " transition-duration: 0.01ms !important; scroll-behavior: auto !important; }";

export interface BasePreferencesOptions {
  needs: Partial<UserNeeds>;
  /** Gazda interfeței noastre (HOST_ID): are tema ei, nu o atingem. */
  ourHostId: string;
  doc?: Document;
}

export interface BasePreferences {
  /** Profilul s-a schimbat: totul se reface după noile limite. */
  update(needs: Partial<UserNeeds>): void;
  /** Pagina s-a schimbat mult (ex. rețeta agentului a fost aplicată): se măsoară din nou totul. */
  refresh(): void;
  /** Pagina revine la cum era (preferințele oprite pe site-ul acesta). */
  stop(): void;
  /** Câte elemente au fost ajustate acum; pentru panou și pentru teste. */
  adjustedCount(): number;
}

/** O schimbare de stil hotărâtă la măsurare și scrisă după, împreună cu celelalte. */
interface StyleWrite {
  element: HTMLElement;
  property: string;
  value: string;
}

/** Ce măsurăm înainte de scriere, ca să verificăm după (verifyGrowth) ce a stricat o mărire. */
interface Measured {
  /** Dreptunghiul de dinainte al fiecărui element cu text sau interactiv. */
  rects: Map<HTMLElement, DOMRect>;
  /** Cutia părinte de dinainte, pentru textul pe care îl mărim. */
  parents: Map<HTMLElement, DOMRect>;
  /** Prima poză din fiecare țintă pe care o mărim, cu mărimea ei de dinainte. */
  media: Map<HTMLElement, { media: Element; rect: DOMRect }>;
  /** Vecinii cu fontul mărit la o trecere de dinainte: verificați din nou când conținutul nou îi împinge. */
  grownBefore: Set<HTMLElement>;
}

/** Ce era în stilul inline al unui element înainte de noi, ca `stop()` să-l pună la loc exact. */
type SavedInline = Map<string, { value: string; priority: string }>;

export function startBasePreferences(options: BasePreferencesOptions): BasePreferences {
  const doc = options.doc ?? document;
  let thresholds = thresholdsFor(options.needs);
  let needs = options.needs;
  const saved = new Map<HTMLElement, SavedInline>();

  function setImportant(element: HTMLElement, property: string, value: string): void {
    let inline = saved.get(element);
    if (!inline) {
      inline = new Map();
      saved.set(element, inline);
    }
    if (!inline.has(property)) {
      inline.set(property, {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property),
      });
    }
    element.style.setProperty(property, value, "important");
  }

  function restoreAll(): void {
    for (const [element, inline] of saved) {
      for (const [property, { value, priority }] of inline) {
        if (value) element.style.setProperty(property, value, priority);
        else element.style.removeProperty(property);
      }
    }
    saved.clear();
  }

  /** Pune la loc doar câteva proprietăți ale unui element (o mărire anulată la verificare). */
  function restoreProperties(element: HTMLElement, properties: string[]): void {
    const inline = saved.get(element);
    if (!inline) return;
    for (const property of properties) {
      const original = inline.get(property);
      if (!original) continue;
      if (original.value) element.style.setProperty(property, original.value, original.priority);
      else element.style.removeProperty(property);
      inline.delete(property);
    }
    if (inline.size === 0) saved.delete(element);
  }

  /**
   * Întâi măsurăm tot, apoi scriem tot. Dacă am scrie un stil și am citi apoi mărimea elementului următor, browserul
   * ar reface layout-ul paginii la fiecare element: pe o pagină de 16 000 de elemente (Wikipedia) asta dura atât
   * cât să blocheze tab-ul. Așa, layout-ul se reface o singură dată.
   */
  function adjustSubtree(root: Element): void {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const element = node as Element;
        if (SKIPPED_TAGS.has(element.localName) || element.id === options.ourHostId) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const writes: StyleWrite[] = [];
    const measured: Measured = { rects: new Map(), parents: new Map(), media: new Map(), grownBefore: new Set() };
    let visited = 0;
    for (let node: Node | null = root; node && visited < MAX_BASE_ELEMENTS; node = walker.nextNode()) {
      visited += 1;
      if (node instanceof HTMLElement && !isOurs(node)) planElement(node, writes, measured);
    }
    if (root !== doc.body && root !== doc.documentElement) measureNeighbors(root, measured);
    for (const { element, property, value } of writes) setImportant(element, property, value);
    verifyGrowth(writes, measured);
  }

  /**
   * Trecere parțială (conținut adăugat de site după încărcare): textele din jur, măsurate înainte de scriere, intră în
   * verificare, iar cele mărite la o trecere de dinainte sunt verificate din nou. Altfel adresa unui rezultat Google,
   * mărită la încărcare, rămânea sub linkul „Traducerea acestei pagini” apărut după (găsit de E).
   */
  function measureNeighbors(root: Element, measured: Measured): void {
    let around: Element = root;
    for (let depth = 0; depth < NEIGHBORHOOD_DEPTH && around.parentElement; depth++) around = around.parentElement;
    if (around === doc.body || around === doc.documentElement) return;
    let count = 0;
    for (const element of around.querySelectorAll("*")) {
      if (count >= MAX_NEIGHBORS) break;
      if (!(element instanceof HTMLElement) || root.contains(element) || measured.rects.has(element)) continue;
      if (!hasOwnText(element) || isOurs(element)) continue;
      const rect = element.getBoundingClientRect();
      if (!isVisible(element, rect)) continue;
      count += 1;
      measured.rects.set(element, rect);
      if (saved.get(element)?.has("font-size")) {
        measured.grownBefore.add(element);
        if (element.parentElement) measured.parents.set(element, element.parentElement.getBoundingClientRect());
      }
    }
  }

  /**
   * După scriere, o singură măsurare (al doilea layout al trecerii). O mărire care a pus elementul peste un text peste
   * care nu era înainte (avatarul din Teams peste nume, ora din WhatsApp peste mesaj) sau care a mărit o poză din el
   * (Instagram) se anulează, doar pentru acel element. Textul care curge normal împinge restul paginii și rămâne mărit;
   * pentru text anulăm doar ce stă în afara fluxului sau iese din cutia lui. Auditul raportează mai departe ce a rămas
   * sub limită, ca problemă a site-ului (specs/07, „Preferințele de bază”).
   */
  function verifyGrowth(writes: StyleWrite[], measured: Measured): void {
    const grown = new Map<HTMLElement, { font: boolean; target: boolean }>();
    for (const { element, property } of writes) {
      if (property !== "font-size" && property !== "min-height") continue;
      const kind = grown.get(element) ?? { font: false, target: false };
      if (property === "font-size") kind.font = true;
      else kind.target = true;
      grown.set(element, kind);
    }
    if (grown.size === 0) return;
    // vecinii măriți mai demult: dacă acum acoperă un text nou, li se anulează mărirea, ca la o trecere întreagă
    for (const element of measured.grownBefore)
      if (!grown.has(element)) grown.set(element, { font: true, target: false });
    // Doar citim de aici până la anulări: browserul face layout-ul o dată, iar dreptunghiurile se refolosesc.
    const after = new Map<HTMLElement, DOMRect>();
    const afterOf = (element: HTMLElement): DOMRect => {
      let rect = after.get(element);
      if (!rect) {
        rect = element.getBoundingClientRect();
        after.set(element, rect);
      }
      return rect;
    };
    const texts = textGrid(
      [...measured.rects.keys()].filter((element) => hasOwnText(element)),
      afterOf,
    );
    // Pe o pagină mare (Wikipedia), aceleași paragrafe și aceleași cutii se verifică pentru multe elemente: le
    // calculăm o singură dată pe trecere.
    const lines = new Map<HTMLElement, DOMRect[]>();
    const linesOf = (element: HTMLElement): DOMRect[] => {
      let rects = lines.get(element);
      if (!rects) {
        rects = ownTextRects(element);
        lines.set(element, rects);
      }
      return rects;
    };
    const outOfFlow = new Map<Element, boolean>();
    const undo: [HTMLElement, string[]][] = [];
    for (const [element, kind] of grown) {
      const before = measured.rects.get(element);
      if (!before) continue;
      if (kind.target && mediaResized(measured.media.get(element))) {
        undo.push([element, TARGET_GROWTH]);
        continue;
      }
      const now = afterOf(element);
      // un vecin mărit mai demult e suspect oricum: dacă textul nou a ajuns peste el, cineva trebuie să cedeze, și
      // cedează mărirea veche, ca la o trecere întreagă
      const textSuspect =
        kind.font &&
        (measured.grownBefore.has(element) ||
          isOutOfFlow(element, outOfFlow) ||
          spilled(element, before, now, measured.parents.get(element)));
      if (!kind.target && !textSuspect) continue;
      // Un text mărit acoperă ceva doar cu rândurile lui; o țintă mărită, cu toată cutia (avatarul din Teams).
      const covering = kind.target ? [now] : linesOf(element);
      if (!overlapsNewText(element, before, now, covering, texts, measured.rects, afterOf, linesOf)) continue;
      undo.push([element, [...(kind.target ? TARGET_GROWTH : []), ...(textSuspect ? FONT_GROWTH : [])]]);
    }
    for (const [element, properties] of undo) restoreProperties(element, properties);
  }

  function isOurs(element: Element): boolean {
    return element.id === options.ourHostId || element.closest(`#${CSS.escape(options.ourHostId)}`) !== null;
  }

  /** Doar citește pagina și notează ce trebuie scris; scrierea vine după, toată odată. */
  function planElement(element: HTMLElement, writes: StyleWrite[], measured: Measured): void {
    const rect = element.getBoundingClientRect();
    if (!isVisible(element, rect)) return;
    const style = getComputedStyle(element);
    const ownText = hasOwnText(element);
    const interactive = isInteractive(element);
    if (ownText || interactive) measured.rects.set(element, rect);
    if (ownText) planText(element, style, rect, thresholds, writes, measured);
    if (!interactive) return;
    planBorder(element, writes);
    if (wantsBiggerTargets(needs) && !isLinkInSentence(element, style)) {
      planTarget(element, style, rect, thresholds, writes, measured);
    }
  }

  function planText(
    element: HTMLElement,
    style: CSSStyleDeclaration,
    rect: DOMRect,
    t: AuditThresholds,
    writes: StyleWrite[],
    measured: Measured,
  ): void {
    const originalFontPx = parseFloat(style.fontSize);
    let fontPx = originalFontPx;
    const raised = fontPx < t.minFontPx && !isClippedLabel(element, style);
    if (raised) {
      writes.push({ element, property: "font-size", value: `${t.minFontPx}px` });
      fontPx = t.minFontPx;
      if (element.parentElement) measured.parents.set(element, element.parentElement.getBoundingClientRect());
    }
    const lineHeightPx = style.lineHeight === "normal" ? undefined : parseFloat(style.lineHeight);
    if (isSingleLineText(element, style, rect)) {
      // O etichetă pe un rând (un număr de aprecieri, numele unui canal): rândul își păstrează înălțimea dată de site,
      // ca eticheta mărită să rămână la locul ei față de vecini. Cu `line-height: 1.5` pus peste tot, „6,74 mil.
      // abonați” de sub numele canalului creștea de la 18 la 24px și împingea numele în sus (YouTube, găsit de Adelin).
      // Doar pe frunze: un `line-height` fix s-ar moșteni la copiii cu alt font.
      if (raised && lineHeightPx !== undefined && Number.isFinite(lineHeightPx) && element.childElementCount === 0) {
        writes.push({ element, property: "line-height", value: `${Math.max(lineHeightPx, fontPx)}px` });
      }
    } else if (isContentText(element) && !isInHeightLimitedBox(element)) {
      // Rândurile unui paragraf, cu fontul de după ridicare: un `line-height` fix în px devine prea strâns când
      // textul crește (WCAG 1.4.12).
      const usedPx = lineHeightPx ?? NORMAL_LINE_HEIGHT * originalFontPx;
      if (Number.isFinite(usedPx) && usedPx / fontPx < t.minLineHeight) {
        writes.push({ element, property: "line-height", value: String(t.minLineHeight) });
      }
    }
    const color = parseColor(style.color);
    // Pe gradient sau imagine nu știm fundalul: o culoare „reparată” după rezerva albă ar strica textul (alb pe albastru).
    if (!color || hasImageBackground(element)) return;
    const background = effectiveBackground(element);
    const text = toHex(composite(color, background));
    const required = requiredTextContrast(fontPx, parseInt(style.fontWeight, 10) || undefined, t);
    if (contrastRatio(text, background) < required) {
      writes.push({ element, property: "color", value: adjustToContrast(text, background, required) });
    }
  }

  /** Marginea unui buton sau câmp, dacă abia se vede pe fundalul din jur: aceeași nuanță, până la 3:1 (WCAG 1.4.11). */
  function planBorder(element: HTMLElement, writes: StyleWrite[]): void {
    const border = factsOf(element).nonText;
    if (!border) return;
    const contrast = contrastRatio(border.color, border.background);
    if (contrast >= HARD_LIMITS.minContrastUi || contrast < MIN_INTENDED_BORDER_CONTRAST) return;
    writes.push({
      element,
      property: "border-color",
      value: adjustToContrast(border.color, border.background, HARD_LIMITS.minContrastUi),
    });
  }

  function planTarget(
    element: HTMLElement,
    style: CSSStyleDeclaration,
    rect: DOMRect,
    t: AuditThresholds,
    writes: StyleWrite[],
    measured: Measured,
  ): void {
    if (rect.width >= t.minTargetPx && rect.height >= t.minTargetPx) return;
    const media = element.querySelector(MEDIA_SELECTOR);
    if (media) measured.media.set(element, { media, rect: media.getBoundingClientRect() });
    // Un element inline nu ia min-height; inline-block îl lasă în rând, dar cu mărimea cerută.
    if (style.display === "inline") writes.push({ element, property: "display", value: "inline-block" });
    writes.push({ element, property: "min-height", value: `${t.minTargetPx}px` });
    writes.push({ element, property: "min-width", value: `${t.minTargetPx}px` });
  }

  function applyMotion(): void {
    const existing = doc.getElementById(BASE_STYLE_ID);
    if (!needs.reducedMotion) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const sheet = doc.createElement("style");
    sheet.id = BASE_STYLE_ID;
    sheet.textContent = REDUCED_MOTION_CSS;
    (doc.head ?? doc.documentElement).append(sheet);
  }

  function applyAll(): void {
    restoreAll();
    applyMotion();
    adjustSubtree(doc.body ?? doc.documentElement);
  }

  // Ce adaugă site-ul după încărcare (liste care se încarcă pe parcurs, aplicații de o pagină) primește aceleași limite.
  // Le strângem și le ajustăm o dată, după ce site-ul a terminat schimbarea curentă.
  let pending: Element[] = [];
  // Și ce devine vizibil fără elemente noi: un <details> deschis („Plătește factura” din meniul „⋯”), un `hidden` scos.
  const observer = new MutationObserver((records) => {
    const first = pending.length === 0;
    for (const record of records) {
      if (record.type === "attributes" && record.target instanceof Element) pending.push(record.target);
      for (const node of record.addedNodes) if (node instanceof Element) pending.push(node);
    }
    if (first && pending.length > 0) {
      queueMicrotask(() => {
        const added = pending;
        pending = [];
        for (const element of added) if (element.isConnected) adjustSubtree(element);
      });
    }
  });

  applyAll();
  observer.observe(doc.body ?? doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: REVEALING_ATTRIBUTES,
  });

  return {
    update(next) {
      needs = next;
      thresholds = thresholdsFor(next);
      applyAll();
    },
    refresh: applyAll,
    stop() {
      observer.disconnect();
      pending = [];
      restoreAll();
      doc.getElementById(BASE_STYLE_ID)?.remove();
    },
    adjustedCount: () => saved.size,
  };
}

/**
 * Țintele le mărim doar când profilul cere mai mult decât minimul implicit: testul de atingere a arătat că omul ratează
 * butoanele mici. Cu profilul implicit, 44px pe fiecare link din meniuri, liste și rezultate deforma orice site la
 * prima vizită, fără ca omul să fi cerut ceva (găsit de Adelin). Auditul raportează țintele mici mai departe, iar
 * agentul le mărește la cerere. Fontul minim (16px, cerința juriului) și contrastul se aplică oricum.
 */
function wantsBiggerTargets(needs: Partial<UserNeeds>): boolean {
  return (needs.minTargetPx ?? 0) > HARD_LIMITS.minTargetPx;
}

/** Cele două dreptunghiuri se suprapun mai mult decât o atingere de margini. */
function overlaps(a: DOMRect, b: DOMRect): boolean {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > OVERLAP_MIN_PX && height > OVERLAP_MIN_PX;
}

/** Partea comună a două dreptunghiuri (zero pe o axă unde nu se ating). */
function intersection(a: DOMRect, b: DOMRect): { width: number; height: number } {
  return {
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)),
  };
}

/** Suprapunerea dintre element și text a crescut, pe lățime sau pe înălțime, mai mult decât o atingere de margini. */
function overlapGrew(elementBefore: DOMRect, textBefore: DOMRect, elementNow: DOMRect, textNow: DOMRect): boolean {
  const was = intersection(elementBefore, textBefore);
  const is = intersection(elementNow, textNow);
  return is.width > was.width + OVERLAP_MIN_PX || is.height > was.height + OVERLAP_MIN_PX;
}

/** `inner` iese din `outer` mai mult decât o atingere de margini. */
function outside(inner: DOMRect, outer: DOMRect): boolean {
  return (
    inner.x < outer.x - OVERLAP_MIN_PX ||
    inner.y < outer.y - OVERLAP_MIN_PX ||
    inner.x + inner.width > outer.x + outer.width + OVERLAP_MIN_PX ||
    inner.y + inner.height > outer.y + outer.height + OVERLAP_MIN_PX
  );
}

/** Textul mărit a ieșit din cutia părinte, care nu i-a făcut loc (înainte încăpea). */
function spilled(element: HTMLElement, before: DOMRect, now: DOMRect, parentBefore: DOMRect | undefined): boolean {
  const parent = element.parentElement;
  if (!parent || !parentBefore) return false;
  return outside(now, parent.getBoundingClientRect()) && !outside(before, parentBefore);
}

/** Elementul sau o cutie de deasupra lui stă în afara fluxului: mărit, nu împinge nimic, ci trece peste. */
function isOutOfFlow(element: HTMLElement, memo: Map<Element, boolean>): boolean {
  let node: Element | null = element;
  for (let depth = 0; node && depth <= OUT_OF_FLOW_DEPTH; depth++, node = node.parentElement) {
    let out = memo.get(node);
    if (out === undefined) {
      const style = getComputedStyle(node);
      const float = style.getPropertyValue("float");
      out = style.position === "absolute" || style.position === "fixed" || (float !== "" && float !== "none");
      memo.set(node, out);
    }
    if (out) return true;
  }
  return false;
}

/** Poza din țintă și-a schimbat mărimea odată cu ținta (o imagine cu lățimea 100% din link). */
function mediaResized(entry: { media: Element; rect: DOMRect } | undefined): boolean {
  if (!entry) return false;
  const now = entry.media.getBoundingClientRect();
  return (
    Math.abs(now.width - entry.rect.width) > RESIZE_EPS_PX || Math.abs(now.height - entry.rect.height) > RESIZE_EPS_PX
  );
}

/** Elementul mărit acoperă acum un text (altul decât al lui) pe care nu-l acoperea înainte. */
function overlapsNewText(
  element: HTMLElement,
  before: DOMRect,
  now: DOMRect,
  covering: DOMRect[],
  texts: TextGrid,
  beforeRects: Map<HTMLElement, DOMRect>,
  afterOf: (element: HTMLElement) => DOMRect,
  linesOf: (element: HTMLElement) => DOMRect[],
): boolean {
  // Cutia unui text pe mai multe rânduri cuprinde și ce stă înaintea primului rând (linkul „^ a b” din fața unei note
  // Wikipedia), deci comparăm rândurile. Fără rânduri măsurabile, rămâne cutia.
  const parts = covering.length > 0 ? covering : [now];
  for (const text of texts.near(now)) {
    if (text === element || !overlaps(now, afterOf(text))) continue;
    // Ce se suprapunea deja înainte e alegerea site-ului, cât timp suprapunerea nu crește. Colțul unui mesaj WhatsApp
    // editat («Editat 08:58») atinge deja cutia mesajului (cu spațiul lăsat pentru colț), dar mărit îi acoperă textul.
    const textBefore = beforeRects.get(text);
    if (textBefore && overlaps(before, textBefore) && !overlapGrew(before, textBefore, now, afterOf(text))) continue;
    if (element.contains(text) || text.contains(element)) continue;
    // Cutia unui paragraf trece și pe sub un float (caseta din dreapta pe Wikipedia), dar rândurile lui îl ocolesc:
    // contează doar dacă elementul mărit acoperă rândurile de text. Fără rânduri măsurabile, rămâne cutia.
    const lines = linesOf(text);
    const textParts = lines.length > 0 ? lines : [afterOf(text)];
    if (!parts.some((part) => textParts.some((line) => overlaps(part, line)))) continue;
    return true;
  }
  return false;
}

/** Textele paginii, așezate pe pătrate după dreptunghiul lor de după scriere. */
interface TextGrid {
  /** Textele care ar putea atinge dreptunghiul dat (din pătratele lui, plus cele foarte mari). */
  near(rect: DOMRect): Iterable<HTMLElement>;
}

/**
 * Pe Wikipedia sunt ~9000 de texte și sute de ținte mărite: comparate fiecare cu fiecare, verificarea dura 3–4 secunde.
 * Cu grila, fiecare element mărit se compară doar cu textele din preajmă.
 */
function textGrid(texts: HTMLElement[], afterOf: (element: HTMLElement) => DOMRect): TextGrid {
  const cells = new Map<string, HTMLElement[]>();
  const wide: HTMLElement[] = [];
  const span = (rect: DOMRect) => ({
    x0: Math.floor(rect.x / GRID_CELL_PX),
    x1: Math.floor((rect.x + rect.width) / GRID_CELL_PX),
    y0: Math.floor(rect.y / GRID_CELL_PX),
    y1: Math.floor((rect.y + rect.height) / GRID_CELL_PX),
  });
  for (const text of texts) {
    const rect = afterOf(text);
    if (rect.width <= 0 || rect.height <= 0) continue;
    const { x0, x1, y0, y1 } = span(rect);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_GRID_CELLS_PER_TEXT) {
      wide.push(text);
      continue;
    }
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = `${x},${y}`;
        const cell = cells.get(key);
        if (cell) cell.push(text);
        else cells.set(key, [text]);
      }
    }
  }
  return {
    near(rect) {
      const found = new Set<HTMLElement>(wide);
      const { x0, x1, y0, y1 } = span(rect);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) for (const text of cells.get(`${x},${y}`) ?? []) found.add(text);
      }
      return found;
    },
  };
}

/**
 * O etichetă scurtă dintr-o cutie îngustă care taie textul (un rând, fără trecere pe rândul următor): bara
 * laterală din Teams („Activitate” → „Acti…”). Mărită, se suprapune cu iconița și nu se mai citește deloc, deci o
 * lăsăm cum e; auditul o raportează în continuare ca problemă a site-ului (găsit de E pe teams.cloud.microsoft).
 */
function isClippedLabel(element: HTMLElement, style: CSSStyleDeclaration): boolean {
  if ((element.textContent ?? "").trim().length > CLIPPED_LABEL_MAX_CHARS) return false;
  let node: HTMLElement | null = element;
  let nodeStyle = style;
  for (let depth = 0; node && depth <= CLIPPING_LABEL_DEPTH; depth++) {
    // `overflow` scurt, unde motorul nu desface `overflow-x` (happy-dom în teste)
    const overflowX = nodeStyle.overflowX || nodeStyle.overflow;
    const clipsOneLine =
      nodeStyle.textOverflow === "ellipsis" || (CLIPPING_OVERFLOW.has(overflowX) && nodeStyle.whiteSpace === "nowrap");
    if (clipsOneLine) return node.getBoundingClientRect().width <= CLIPPED_LABEL_MAX_BOX_PX;
    node = node.parentElement;
    if (node) nodeStyle = getComputedStyle(node);
  }
  return false;
}

/** Text de citit (paragrafe, liste), nu butoane sau titluri: aceeași regulă ca `line-height` din audit.ts. */
function isContentText(element: HTMLElement): boolean {
  return !isInteractive(element) && !/^h[1-6]$/.test(element.localName) && element.getAttribute("role") !== "heading";
}
