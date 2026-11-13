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
import { effectiveBackground, factsOf } from "./dom";
import { hasOwnText, isInteractive, isLinkInSentence, isVisible, SKIPPED_TAGS } from "./page-audit";
import { thresholdsFor } from "./thresholds";

/** Foaia noastră pentru mișcare redusă; „uishapeshifter” în id, ca rețeta agentului să n-o poată atinge (C5). */
export const BASE_STYLE_ID = "uishapeshifter-base";
/** Câte elemente verificăm cel mult la o trecere; o pagină mai mare primește restul pe măsură ce se schimbă. */
export const MAX_BASE_ELEMENTS = 20_000;
/** `line-height: normal` în browsere e ~1.2 din mărimea fontului (la fel ca în dom.ts). */
const NORMAL_LINE_HEIGHT = 1.2;

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
    let visited = 0;
    for (let node: Node | null = root; node && visited < MAX_BASE_ELEMENTS; node = walker.nextNode()) {
      visited += 1;
      if (node instanceof HTMLElement && !isOurs(node)) planElement(node, writes);
    }
    for (const { element, property, value } of writes) setImportant(element, property, value);
  }

  function isOurs(element: Element): boolean {
    return element.id === options.ourHostId || element.closest(`#${CSS.escape(options.ourHostId)}`) !== null;
  }

  /** Doar citește pagina și notează ce trebuie scris; scrierea vine după, toată odată. */
  function planElement(element: HTMLElement, writes: StyleWrite[]): void {
    const rect = element.getBoundingClientRect();
    if (!isVisible(element, rect)) return;
    const style = getComputedStyle(element);
    if (hasOwnText(element)) planText(element, style, thresholds, writes);
    if (!isInteractive(element)) return;
    planBorder(element, writes);
    if (!isLinkInSentence(element, style)) planTarget(element, style, rect, thresholds, writes);
  }

  function planText(element: HTMLElement, style: CSSStyleDeclaration, t: AuditThresholds, writes: StyleWrite[]): void {
    const originalFontPx = parseFloat(style.fontSize);
    let fontPx = originalFontPx;
    if (fontPx < t.minFontPx) {
      writes.push({ element, property: "font-size", value: `${t.minFontPx}px` });
      fontPx = t.minFontPx;
    }
    // Rândurile, cu fontul de după ridicare: un `line-height` fix în px devine prea strâns când textul crește.
    if (isContentText(element)) {
      const lineHeightPx =
        style.lineHeight === "normal" ? NORMAL_LINE_HEIGHT * originalFontPx : parseFloat(style.lineHeight);
      if (Number.isFinite(lineHeightPx) && lineHeightPx / fontPx < t.minLineHeight) {
        writes.push({ element, property: "line-height", value: String(t.minLineHeight) });
      }
    }
    const color = parseColor(style.color);
    if (!color) return;
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
    if (!border || contrastRatio(border.color, border.background) >= HARD_LIMITS.minContrastUi) return;
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
  ): void {
    if (rect.width >= t.minTargetPx && rect.height >= t.minTargetPx) return;
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
  const observer = new MutationObserver((records) => {
    const first = pending.length === 0;
    for (const record of records) {
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
  observer.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true });

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

/** Text de citit (paragrafe, liste), nu butoane sau titluri: aceeași regulă ca `line-height` din audit.ts. */
function isContentText(element: HTMLElement): boolean {
  return !isInteractive(element) && !/^h[1-6]$/.test(element.localName) && element.getAttribute("role") !== "heading";
}
